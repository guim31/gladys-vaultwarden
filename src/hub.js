// -----------------------------------------------------------------------------
// The Vaultwarden hub: reads the server on a timer of the container, publishes
// the device and its states when they change, and fires the scene events on
// transitions (server unreachable, reachable again, new release available).
//
// Gladys never polls the device (should_poll: false): the scene events must
// fire even when the device was not added, the intervals offered (30 s to
// 15 min) are not all in the core's list, and a device created without
// should_poll is never polled by Gladys 5.2 (Gladys#3198).
//
// Three sources, three paces:
//   - /alive and /api/version at every reading;
//   - the admin statistics (admin token only) every ADMIN_INTERVAL_MS at
//     most: a login is rate limited by Vaultwarden (3 per 5 min by default),
//     and a refused token is not tried again until the configuration changes
//     or "Test the connection" (fail2ban often watches these logins);
//   - the latest release on GitHub every LATEST_INTERVAL_MS.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  FEATURE_KEYS,
  DEVICE_NAME,
  buildServerDevice,
  serverIds,
  serverValues,
} from './devices.js';
import {
  ADMIN_ERROR_KINDS,
  ERROR_KINDS,
  createClient,
  isNewer,
  readLatestRelease,
} from './vaultwarden/client.js';
import { CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, render } from './texts.js';

const logger = createLogger({ name: 'vaultwarden-hub' });

export const WIDGET_KEY = 'server';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  OFFLINE: 'server_offline',
  ONLINE: 'server_online',
  UPDATE: 'update_available',
});

export const HUB_TIMINGS = {
  // Every state is sent again at least this often, so that Gladys never shows
  // "no recent value" for a value that does not change.
  heartbeatMs: 12 * 60 * 60_000,
  // Admin statistics: at most this often (or at the refresh interval, if longer).
  adminMs: 5 * 60_000,
  // GitHub: 60 anonymous requests an hour per address; a few a day is plenty.
  latestMs: 6 * 60 * 60_000,
  // After a failed GitHub request.
  latestRetryMs: 60 * 60_000,
};

// Admin errors not worth trying again before the configuration changes.
const ADMIN_BLOCKING = new Set([ADMIN_ERROR_KINDS.AUTH, ADMIN_ERROR_KINDS.DISABLED]);

const emptyServer = () => ({
  reachable: null,
  responseMs: null,
  version: null,
  latest: null,
  updateAvailable: null,
});

export class VaultwardenHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {Function} [options.request] HTTP seam (src/vaultwarden/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.server = emptyServer();
    /** Error of the last server reading ({ kind, message }), or null. */
    this.error = null;
    this.read = false;
    this.downSince = null;
    this.offlineAnnounced = false;
    /** Account counts of the last admin reading, or null. */
    this.admin = null;
    this.adminError = null;
    this.adminAt = null;
    this.latestAt = null;
    this.latestFailed = false;
    /** The release already announced by `update_available`; undefined: no baseline yet. */
    this.announced = undefined;
    /** Last value published per feature external id. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.discovered = null;
    this.heartbeatAt = 0;
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (reachable, lost, back, new release, user
  // commands). A problem that repeats every cycle is logged once at its own
  // level, then at debug until it clears. LOG_LEVEL=debug shows everything.
  // The admin token and the session cookie are never logged.

  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  resolved(key) {
    this.warned.delete(key);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const signature = JSON.stringify([config.url, config.adminToken, config.insecure]);
    if (signature !== this.signature) {
      const otherServer = previous?.url !== config.url;
      this.signature = signature;
      this.client = config.url
        ? createClient(
            {
              url: config.url,
              adminToken: config.adminToken,
              insecure: config.insecure,
              now: this.now,
            },
            this.request,
          )
        : null;
      this.admin = null;
      this.adminError = null;
      this.adminAt = null;
      this.error = null;
      if (otherServer) {
        // Another server: start over, without scene events for what the first
        // reading finds.
        const latest = this.server.latest;
        this.server = { ...emptyServer(), latest };
        this.read = false;
        this.downSince = null;
        this.offlineAnnounced = false;
        this.announced = undefined;
      }
      this.published.clear();
      this.transport = null;
    } else if (
      previous &&
      (previous.language !== config.language || previous.checkUpdates !== config.checkUpdates)
    ) {
      // Last activity is a localized text; the update features come or go.
      this.published.clear();
    }
    if (!config.checkUpdates) {
      this.server.updateAvailable = null;
    }
    this.discovered = null;
    try {
      // Fresh: a reading in flight may have published before the change.
      await this.poll({ fresh: true });
    } finally {
      // Even after an unexpected error: the timer keeps reading.
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.polling?.catch(() => {});
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.poll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading ---------------------------------------------------------------

  /**
   * Read the server and apply what changed. Concurrent calls share the read;
   * `fresh` reads again after the one in flight (the configuration changed).
   */
  poll({ fresh = false, forceAdmin = false } = {}) {
    if (this.polling && !fresh) {
      return this.polling;
    }
    const previous = this.polling ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(() => this.readAll({ forceAdmin }))
      .finally(() => {
        if (this.polling === current) {
          this.polling = null;
        }
      });
    this.polling = current;
    return current;
  }

  /** Gladys asks for a refresh (onPoll): read now. */
  async pollDevice() {
    await this.poll();
  }

  async readAll({ forceAdmin = false } = {}) {
    const client = this.client;
    if (!client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      this.refreshWidget();
      return;
    }
    const stale = () => client !== this.client || this.stopped;
    let reading = null;
    let failure = null;
    // GitHub in parallel: a blackholed api.github.com must not delay the
    // reading of the server, nor its events, by its timeout.
    const latest = this.readLatest();
    try {
      reading = await client.readServer();
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      failure = err;
    }
    const admin = reading && !stale() ? await this.readAdmin(client, { force: forceAdmin }) : null;
    await latest;
    if (stale()) {
      return;
    }
    await this.apply(reading, failure, admin);
  }

  /** The admin statistics, when due; `{ stats }` or `{ error }`, null when not read. */
  async readAdmin(client, { force }) {
    const { adminToken, pollIntervalMs } = this.config;
    if (!adminToken) {
      return null;
    }
    if (!force) {
      if (this.adminError && ADMIN_BLOCKING.has(this.adminError.kind)) {
        return null;
      }
      const every = Math.max(this.timings.adminMs, pollIntervalMs);
      if (this.adminAt !== null && this.now() - this.adminAt < every) {
        return null;
      }
    }
    this.adminAt = this.now();
    try {
      return { stats: await client.readAdmin() };
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      return { error: err };
    }
  }

  /** The latest release on GitHub, when due. Never throws. */
  async readLatest() {
    if (!this.config.checkUpdates) {
      return;
    }
    const every = this.latestFailed ? this.timings.latestRetryMs : this.timings.latestMs;
    if (this.latestAt !== null && this.now() - this.latestAt < every) {
      return;
    }
    this.latestAt = this.now();
    try {
      this.server.latest = await readLatestRelease(this.request);
      this.latestFailed = false;
      this.resolved('github');
    } catch (err) {
      this.latestFailed = true;
      this.problem('github', `Latest release not read from GitHub: ${err.message}`);
    }
  }

  async apply(reading, failure, admin) {
    const now = this.now();
    const before = { ...this.server };
    let widgetChanged = !this.read;
    const events = [];

    if (reading) {
      if (this.error || before.reachable === false) {
        logger.info(`Vaultwarden ${reading.version ?? '?'}: reachable again`);
      } else if (!this.read) {
        logger.info(`Vaultwarden ${reading.version ?? '?'}: reachable`);
      }
      this.error = null;
      this.server.reachable = true;
      this.server.responseMs = reading.responseMs;
      this.server.version = reading.version;
      // Back after an announced outage only: a server down since the start
      // never had its server_offline.
      if (this.offlineAnnounced) {
        const downtime = this.downSince === null ? 0 : Math.round((now - this.downSince) / 60_000);
        events.push([TRIGGERS.ONLINE, { downtime_minutes: downtime }]);
      }
      this.downSince = null;
      this.offlineAnnounced = false;
    } else {
      const wasError = this.error?.kind;
      this.error = { kind: failure.kind, message: failure.message };
      if (wasError !== failure.kind) {
        logger.warn(`Vaultwarden: ${failure.message}`);
      } else {
        logger.debug(`Vaultwarden: ${failure.message} (again)`);
      }
      this.server.reachable = false;
      this.server.responseMs = null;
      if (before.reachable !== false) {
        this.downSince = now;
      }
      if (this.read && before.reachable === true) {
        events.push([TRIGGERS.OFFLINE, {}]);
        this.offlineAnnounced = true;
      }
    }

    if (admin?.stats) {
      if (this.adminError || this.admin === null) {
        logger.info('Vaultwarden: admin statistics read');
      }
      widgetChanged ||= JSON.stringify(admin.stats) !== JSON.stringify(this.admin);
      this.admin = admin.stats;
      this.adminError = null;
    } else if (admin?.error) {
      const kind = admin.error.kind;
      if (this.adminError?.kind !== kind) {
        logger.warn(`Vaultwarden: ${admin.error.message}`);
        widgetChanged = true;
      }
      this.adminError = { kind, message: admin.error.message };
    }

    this.updateRelease(events);
    widgetChanged ||=
      before.reachable !== this.server.reachable ||
      before.version !== this.server.version ||
      before.updateAvailable !== this.server.updateAvailable ||
      before.latest?.version !== this.server.latest?.version;
    this.read = true;

    await this.publishDevices();
    await this.publishStates();
    await this.publishTransport();
    await this.publishConnectionStatus();
    for (const [key, extra] of events) {
      await this.fire(key, extra);
    }
    if (widgetChanged) {
      this.refreshWidget();
    }
  }

  /** Compare the versions; a new release found while running is an event. */
  updateRelease(events) {
    const { version, latest } = this.server;
    const newer = this.config.checkUpdates && latest ? isNewer(latest.version, version) : null;
    this.server.updateAvailable = newer;
    if (newer === null) {
      return;
    }
    const target = newer ? latest.version : null;
    if (this.announced === undefined) {
      // First comparison (start, other server): the baseline, no event.
      this.announced = target;
      return;
    }
    if (target !== null && target !== this.announced) {
      logger.info(`Vaultwarden ${latest.version} is available (running ${version})`);
      events.push([TRIGGERS.UPDATE, { latest_version: latest.version, release_url: latest.url }]);
    }
    this.announced = target;
  }

  refreshWidget() {
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** The name of the device in Gladys once added, else "Vaultwarden". */
  serverName() {
    const id = serverIds(this.gladys).device;
    return this.gladys.devices?.find((device) => device.external_id === id)?.name || DEVICE_NAME;
  }

  async fire(key, extra) {
    logger.debug(`Scene event ${key}`);
    try {
      await this.gladys.publishSceneEvent(key, {
        device: serverIds(this.gladys).device,
        server: this.serverName(),
        version: this.server.version ?? '-',
        ...extra,
      });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys --------------------------------------------------

  deviceOptions() {
    return {
      language: this.config.language,
      checkUpdates: this.config.checkUpdates,
      withAdmin: this.config.adminToken !== '',
    };
  }

  devices() {
    if (!this.read || !this.client) {
      return [];
    }
    return [buildServerDevice(this.gladys, this.deviceOptions())];
  }

  /** Publish the discovered device when it changes (options, language). */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale device.
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Discovered devices refused: ${err.message}`);
    }
  }

  values() {
    return serverValues(this.gladys, {
      ...this.deviceOptions(),
      server: this.server,
      admin: this.admin,
    });
  }

  /** Publish what changed (`force`: everything known). */
  async publishStates({ force = false } = {}) {
    if (!this.read || !this.client) {
      return;
    }
    const now = this.now();
    const heartbeat = now - this.heartbeatAt >= this.timings.heartbeatMs;
    const states = [];
    for (const { externalId, value } of this.values()) {
      if (value === null) {
        continue;
      }
      if (!force && !heartbeat && this.published.get(externalId) === value) {
        continue;
      }
      // A text/text feature takes `text`, every other one a numeric `state`.
      states.push(
        typeof value === 'string'
          ? { device_feature_external_id: externalId, text: value }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length > 0) {
      try {
        await this.gladys.publishStates(states);
        for (const state of states) {
          this.published.set(state.device_feature_external_id, state.state ?? state.text);
        }
        this.resolved('states');
      } catch (err) {
        // Refused values are not in `published`: they go again as changes.
        this.problem('states', `States refused: ${err.message}`);
      }
    }
    if (heartbeat) {
      // Even after a refusal: a heartbeat at every reading would flood Gladys.
      this.heartbeatAt = now;
    }
  }

  /** The transport badge of the device: local, or unreachable. */
  async publishTransport() {
    if (!this.read || !this.client) {
      return;
    }
    const transport = this.server.reachable
      ? DEVICE_TRANSPORTS.LOCAL
      : DEVICE_TRANSPORTS.UNREACHABLE;
    if (this.transport === transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: serverIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The problem of the configuration, as a message, or null. */
  configProblem() {
    const { config } = this;
    if (!config.url) {
      return config.invalidUrl ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl;
    }
    return null;
  }

  /** The error of the last server reading, as a message. */
  errorMessage() {
    return ERROR_TEXT[this.error.kind] ?? ERROR_TEXT[ERROR_KINDS.HTTP];
  }

  connectionStatus() {
    const problem = this.configProblem();
    if (problem) {
      return { connected: false, message: problem };
    }
    if (this.error) {
      return { connected: false, message: this.errorMessage() };
    }
    // A refused token or a disabled admin page needs the user; a rate limit or
    // a failed read clears by itself (logs, report and widget tell it).
    if (this.adminError && ADMIN_BLOCKING.has(this.adminError.kind)) {
      return { connected: false, message: ERROR_TEXT[this.adminError.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  isOurDevice(externalId) {
    return serverIds(this.gladys).device === externalId;
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.isOurDevice(device.external_id)) {
      return;
    }
    await this.publishStates({ force: true });
    // Sent before the device existed, the transport was dropped by Gladys.
    this.transport = null;
    await this.publishTransport();
    this.refreshWidget();
  }

  /** Renamed or deleted in Gladys: the widget shows the name given in Gladys. */
  onDeviceChanged(device) {
    if (this.isOurDevice(device?.external_id)) {
      this.refreshWidget();
    }
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    this.discovered = null;
    await this.poll();
  }

  // --- Configuration actions -------------------------------------------------

  /** "Test the connection": read now (admin token included), then a short report. */
  async testConnection() {
    await this.poll({ fresh: true, forceAdmin: true });
    const problem = this.configProblem();
    if (problem) {
      return problem;
    }
    if (this.error) {
      return this.errorMessage();
    }
    if (!this.read) {
      return Object.fromEntries(
        Object.entries(REPORT_TEXT).map(([language, text]) => [language, text.waiting]),
      );
    }
    const { server, admin, adminError, config } = this;
    return Object.fromEntries(
      Object.entries(REPORT_TEXT).map(([language, text]) => {
        const parts = [text.server];
        if (server.updateAvailable === true) {
          parts.push(text.update);
        } else if (server.updateAvailable === false) {
          parts.push(text.upToDate);
        }
        if (!config.adminToken) {
          parts.push(text.noAdmin);
        } else if (adminError) {
          parts.push(ERROR_TEXT[adminError.kind][language]);
        } else if (admin) {
          parts.push(text.accounts);
        }
        const values = {
          version: server.version ?? '?',
          ms: server.responseMs ?? '?',
          latest: server.latest?.version ?? '?',
          ...admin,
        };
        return [language, render({ [language]: parts.join(' ') }, values)[language]];
      }),
    );
  }
}

export { FEATURE_KEYS };
