// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys: states, scene events, the admin
// session, the update check, the connection status, the configuration, the
// container's own timer.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_KEYS } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { GITHUB_LATEST_URL } from '../src/vaultwarden/client.js';
import { CONFIG, PUBLIC_CONFIG, createAll, createWorld, serverIdsOf } from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const state = (world, key) => world.fake.lastState(serverIdsOf(world.gladys).feature(key));
const featureKeys = (world) =>
  world.fake.discoveredDevices[0].features.map((feature) => feature.external_id.split(':').at(-1));
const HOUR = 3_600_000;

test('the first reading publishes the device, its states and the connection, without event', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(
    w.fake.discoveredDevices.map((device) => device.name),
    ['Vaultwarden'],
  );
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 1);
  assert.equal(state(w, FEATURE_KEYS.RESPONSE_TIME), 0);
  assert.equal(state(w, FEATURE_KEYS.VERSION), '1.37.5');
  assert.equal(state(w, FEATURE_KEYS.UPDATE_AVAILABLE), 0);
  assert.equal(state(w, FEATURE_KEYS.LATEST_VERSION), '1.37.5');
  // The real /admin/users of the fixture: alice (an organization, active),
  // dave (disabled), bob and carol (invited).
  assert.equal(state(w, FEATURE_KEYS.USERS), 2);
  assert.equal(state(w, FEATURE_KEYS.ORGANIZATIONS), 1);
  assert.equal(state(w, FEATURE_KEYS.INVITATIONS), 2);
  assert.equal(state(w, FEATURE_KEYS.DISABLED), 1);
  // 2026-11-15 01:22:34 UTC, in the time zone of Gladys (Paris).
  assert.equal(state(w, FEATURE_KEYS.LAST_ACTIVITY).replace(/\s/gu, ' '), '11/15/26, 2:22 AM');
  assert.deepEqual(w.fake.transports, [
    { device_external_id: serverIdsOf(w.gladys).device, transport: 'local' },
  ]);
  assert.deepEqual(w.fake.sceneEvents, []);
});

test('without admin token: no account feature, no admin request', async (t) => {
  const w = await createWorld({ config: PUBLIC_CONFIG });
  t.after(() => w.app.stop());
  assert.deepEqual(featureKeys(w), [
    'reachable',
    'response_time',
    'version',
    'update_available',
    'latest_version',
  ]);
  assert.ok(!w.server.requests.some((request) => request.url.includes('/admin')));
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('without update check: no GitHub request, no update feature', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, check_updates: false } });
  t.after(() => w.app.stop());
  assert.ok(!featureKeys(w).includes(FEATURE_KEYS.UPDATE_AVAILABLE));
  assert.ok(!featureKeys(w).includes(FEATURE_KEYS.LATEST_VERSION));
  w.clock.advance(24 * HOUR);
  await w.hub.poll();
  assert.ok(!w.server.requests.some((request) => request.url === GITHUB_LATEST_URL));
});

test('the server going down and back fires its events, with the downtime', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  w.clock.advance(60_000);
  w.server.online = false;
  await w.hub.poll();
  const [offline] = events(w, TRIGGERS.OFFLINE);
  assert.deepEqual(offline.data, {
    device: serverIdsOf(w.gladys).device,
    server: 'Vaultwarden',
    version: '1.37.5',
  });
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 0);
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.fr, /ne répond pas/);
  // Still down: no second event.
  w.clock.advance(60_000);
  await w.hub.poll();
  assert.equal(events(w, TRIGGERS.OFFLINE).length, 1);
  w.clock.advance(11 * 60_000);
  w.server.online = true;
  await w.hub.poll();
  const [online] = events(w, TRIGGERS.ONLINE);
  assert.equal(online.data.downtime_minutes, 12);
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 1);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('a server down at start publishes the device as unreachable, without any event', async (t) => {
  const w = await createWorld({ connect: false });
  t.after(() => w.app.stop());
  w.server.online = false;
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(w.fake.discoveredDevices.length, 1);
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 0);
  assert.equal(state(w, FEATURE_KEYS.VERSION), undefined, 'no version known yet');
  w.server.online = true;
  await w.hub.poll();
  // No server_offline was sent: no server_online either.
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 1);
});

test('a new release fires update_available once, not the release known at start', async (t) => {
  const w = await createWorld({ serverOptions: { version: '1.36.0' } });
  t.after(() => w.app.stop());
  assert.equal(state(w, FEATURE_KEYS.UPDATE_AVAILABLE), 1);
  assert.deepEqual(events(w, TRIGGERS.UPDATE), [], 'known at start: the baseline');
  // GitHub is read every 6 hours only.
  w.server.github.tag = '1.38.0';
  w.clock.advance(HOUR);
  await w.hub.poll();
  assert.equal(state(w, FEATURE_KEYS.LATEST_VERSION), '1.37.5');
  w.clock.advance(6 * HOUR);
  await w.hub.poll();
  assert.equal(state(w, FEATURE_KEYS.LATEST_VERSION), '1.38.0');
  const [update] = events(w, TRIGGERS.UPDATE);
  assert.deepEqual(update.data, {
    device: serverIdsOf(w.gladys).device,
    server: 'Vaultwarden',
    version: '1.36.0',
    latest_version: '1.38.0',
    release_url: 'https://github.com/dani-garcia/vaultwarden/releases/tag/1.38.0',
  });
  w.clock.advance(7 * HOUR);
  await w.hub.poll();
  assert.equal(events(w, TRIGGERS.UPDATE).length, 1, 'once per release');
  // Updated, then the next release.
  w.server.version = '1.38.0';
  await w.hub.poll();
  assert.equal(state(w, FEATURE_KEYS.UPDATE_AVAILABLE), 0);
  w.server.github.tag = '1.38.1';
  w.clock.advance(7 * HOUR);
  await w.hub.poll();
  assert.deepEqual(
    events(w, TRIGGERS.UPDATE).map((event) => event.data.latest_version),
    ['1.38.0', '1.38.1'],
  );
});

test('GitHub is read without the self-signed option, even when it is on', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, url: 'https://192.0.2.10', insecure: true } });
  t.after(() => w.app.stop());
  const github = w.server.requests.find((request) => request.url === GITHUB_LATEST_URL);
  assert.ok(github);
  assert.notEqual(github.options.insecure, true);
});

test('GitHub out of reach: the server is still watched, retried after an hour', async (t) => {
  const w = await createWorld({ connect: false });
  t.after(() => w.app.stop());
  w.server.github.online = false;
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 1);
  assert.equal(state(w, FEATURE_KEYS.UPDATE_AVAILABLE), undefined);
  assert.equal(w.fake.connectionStatus.connected, true);
  w.server.github.online = true;
  w.clock.advance(30 * 60_000);
  await w.hub.poll();
  assert.equal(state(w, FEATURE_KEYS.UPDATE_AVAILABLE), undefined);
  w.clock.advance(31 * 60_000);
  await w.hub.poll();
  assert.equal(state(w, FEATURE_KEYS.UPDATE_AVAILABLE), 0);
});

test('the admin session is reused, renewed before it expires and after a restart', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.equal(w.server.logins, 1);
  // Read every 5 minutes, on the same 20-minute session.
  for (let i = 0; i < 3; i += 1) {
    w.clock.advance(5 * 60_000);
    await w.hub.poll();
  }
  assert.equal(w.server.logins, 1);
  const reads = () => w.server.requests.filter((r) => r.url.endsWith('/admin/users')).length;
  assert.equal(reads(), 4);
  // Not more often than every 5 minutes.
  w.clock.advance(60_000);
  await w.hub.poll();
  assert.equal(reads(), 4);
  // 20 minutes after the login (one minute of margin): a new session.
  w.clock.advance(4 * 60_000);
  await w.hub.poll();
  assert.equal(w.server.logins, 2);
  // Vaultwarden restarted: the cookie is refused, one new login.
  w.server.dropSessions();
  w.server.users.push({ ...w.server.users[1], id: 'new', organizations: [] });
  w.clock.advance(5 * 60_000);
  await w.hub.poll();
  assert.equal(w.server.logins, 3);
  assert.equal(state(w, FEATURE_KEYS.USERS), 3);
});

test('a refused admin token is not tried again until the configuration changes', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, admin_token: 'wrong' } });
  t.after(() => w.app.stop());
  assert.equal(w.server.logins, 1);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Admin token refused/);
  // The server itself is still watched.
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 1);
  assert.equal(state(w, FEATURE_KEYS.USERS), undefined);
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(10 * 60_000);
    await w.hub.poll();
  }
  assert.equal(w.server.logins, 1, 'fail2ban watches these logins');
  // "Test the connection" tries again.
  const ack = await w.fake.action('test_connection', {});
  assert.equal(w.server.logins, 2);
  assert.match(ack.data.message.en, /Admin token refused/);
  await w.fake.configUpdated({ ...CONFIG });
  assert.equal(w.server.logins, 3);
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(state(w, FEATURE_KEYS.USERS), 2);
});

test('an admin page disabled on the server is explained', async (t) => {
  const w = await createWorld({ serverOptions: { adminToken: null } });
  t.after(() => w.app.stop());
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /disabled/);
  w.clock.advance(10 * 60_000);
  await w.hub.poll();
  assert.equal(w.server.logins, 1);
});

test('a rate-limited admin login is tried again at the next admin reading', async (t) => {
  const w = await createWorld({ connect: false });
  t.after(() => w.app.stop());
  w.server.rateLimited = true;
  await w.gladys.connect();
  await w.app.ready;
  // Transient: the integration stays connected, the report tells it.
  assert.equal(w.fake.connectionStatus.connected, true);
  const ack = await w.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /Too many admin logins/);
  w.server.rateLimited = false;
  w.clock.advance(5 * 60_000);
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(state(w, FEATURE_KEYS.USERS), 2);
});

test('another service at the address: not Vaultwarden', async (t) => {
  const w = await createWorld({ connect: false });
  t.after(() => w.app.stop());
  w.server.body = '<html>Welcome to nginx!</html>';
  await w.gladys.connect();
  await w.app.ready;
  assert.match(w.fake.connectionStatus.message.en, /No Vaultwarden server/);
  assert.equal(state(w, FEATURE_KEYS.REACHABLE), 0);
});

test('no address, an unreadable address: the configuration problem, no device', async (t) => {
  const w = await createWorld({ config: { language: 'en' } });
  t.after(() => w.app.stop());
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  await w.fake.configUpdated({ url: 'ftp://192.0.2.10' });
  assert.match(w.fake.connectionStatus.message.en, /not understood/);
  await w.fake.configUpdated({ ...CONFIG });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.discoveredDevices.length, 1);
});

test('adding the device in Gladys publishes every state again, and the transport', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  const before = w.fake.states.length;
  await createAll(w);
  assert.equal(w.fake.states.length - before, 10);
  assert.equal(w.fake.transports.length, 2);
  assert.ok(w.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('only the changes are published, and everything again every 12 hours', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  const count = w.fake.states.length;
  w.clock.advance(60_000);
  await w.hub.poll();
  assert.equal(w.fake.states.length, count, 'nothing changed');
  w.clock.advance(12 * HOUR);
  await w.hub.poll();
  assert.equal(w.fake.states.length, count + 10);
});

test('renaming the device in Gladys renames it in the events and refreshes the widget', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  await createAll(w);
  const device = { ...w.fake.devices[0], name: 'Coffre familial' };
  const refreshes = w.fake.widgetRefreshes.length;
  await w.fake.deviceUpdated(device);
  assert.equal(w.fake.widgetRefreshes.length, refreshes + 1);
  w.server.online = false;
  await w.hub.poll();
  assert.equal(events(w, TRIGGERS.OFFLINE)[0].data.server, 'Coffre familial');
});

test('the language changes the date of the last activity', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  await w.fake.configUpdated({ ...CONFIG, language: 'fr' });
  assert.equal(state(w, FEATURE_KEYS.LAST_ACTIVITY).replace(/\s/gu, ' '), '15/11/2026 02:22');
  assert.equal(w.fake.discoveredDevices[0].features[0].name, 'Joignable');
});

test('the container reads the server on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await createWorld({ timers: true });
  t.after(() => w.app.stop());
  const alive = () => w.server.requests.filter((r) => r.url.endsWith('/alive')).length;
  assert.equal(alive(), 1);
  w.server.online = false;
  t.mock.timers.tick(60_000);
  // Let the reading run.
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(alive(), 2);
  assert.equal(events(w, TRIGGERS.OFFLINE).length, 1);
});

test('a reconnection of Gladys sends the device and its states again', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  const count = w.fake.states.length;
  await w.gladys.disconnect();
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(w.fake.states.length, count + 10);
});
