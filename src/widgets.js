// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `server`.
//
// The use case: "is my password server up, and does it need an update?" at a
// glance, with the accounts when the admin token is set. One status list:
//   - the server (the name given in Gladys): reachable and its response
//     time, or unreachable;
//   - the version, with the release to install when there is one;
//   - with the admin token (hidden by the `show_accounts` setting): users,
//     organizations, pending invitations, disabled accounts, last activity.
// No button: Vaultwarden is administered from its own admin page.
//
// Budget (8 components, 2 texts at most): one status list, or a single text
// when there is nothing to show. The values are sent as values, not bound to
// device features, so the widget works before the device is added to Gladys.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, NAMES } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

export const TEXT = {
  reachable: {
    en: 'Reachable · {ms} ms',
    fr: 'Joignable · {ms} ms',
    de: 'Erreichbar · {ms} ms',
    es: 'Accesible · {ms} ms',
  },
  unreachable: {
    en: 'Unreachable',
    fr: 'Injoignable',
    de: 'Nicht erreichbar',
    es: 'Inaccesible',
  },
  upToDate: {
    en: '{version} · up to date',
    fr: '{version} · à jour',
    de: '{version} · aktuell',
    es: '{version} · actualizado',
  },
  update: {
    en: '{version} → {latest}',
    fr: '{version} → {latest}',
    de: '{version} → {latest}',
    es: '{version} → {latest}',
  },
  never: { en: 'None yet', fr: 'Aucune encore', de: 'Noch keine', es: 'Ninguna aún' },
  waiting: {
    en: 'Waiting for the first reading of Vaultwarden…',
    fr: 'En attente de la première lecture de Vaultwarden…',
    de: 'Warte auf die erste Abfrage von Vaultwarden…',
    es: 'Esperando la primera lectura de Vaultwarden…',
  },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

const fill = (text, language, values) =>
  pick(text, language).replace(/\{(\w+)\}/g, (all, key) =>
    key in values ? String(values[key]) : all,
  );

function message(text, language, ttl = 60) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: fit(pick(text, language), 300) }],
  };
}

/** "5 min ago", "2 h ago", "3 days ago", in the language of the dashboard. */
export function ago(time, now, language) {
  const minutes = Math.max(1, Math.round((now - time) / 60_000));
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'always', style: 'short' });
  if (minutes < 60) {
    return format.format(-minutes, 'minute');
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return format.format(-hours, 'hour');
  }
  return format.format(-Math.round(hours / 24), 'day');
}

const isTrue = (value) => value === true || value === 'true';

function serverRow(hub, language) {
  const { server } = hub;
  return {
    label: fit(hub.serverName(), 40),
    icon: server.reachable ? 'server' : 'alert-triangle',
    value: fit(
      server.reachable
        ? fill(TEXT.reachable, language, { ms: server.responseMs ?? '?' })
        : pick(TEXT.unreachable, language),
      40,
    ),
    color: server.reachable ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
  };
}

function versionRow(hub, language, names) {
  const { server } = hub;
  const values = { version: server.version ?? '?', latest: server.latest?.version ?? '?' };
  if (server.updateAvailable === true) {
    return {
      label: names[FEATURE_KEYS.UPDATE_AVAILABLE],
      icon: 'download',
      value: fit(fill(TEXT.update, language, values), 40),
      color: WIDGET_COLORS.WARNING,
    };
  }
  return {
    label: names[FEATURE_KEYS.VERSION],
    icon: server.updateAvailable === false ? 'check-circle' : 'tag',
    value: fit(
      server.updateAvailable === false ? fill(TEXT.upToDate, language, values) : values.version,
      40,
    ),
    color: server.updateAvailable === false ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  };
}

function accountRows(hub, language, names) {
  const { admin } = hub;
  const now = hub.now();
  return [
    { key: FEATURE_KEYS.USERS, icon: 'users', value: admin.users },
    { key: FEATURE_KEYS.ORGANIZATIONS, icon: 'briefcase', value: admin.organizations },
    {
      key: FEATURE_KEYS.INVITATIONS,
      icon: 'mail',
      value: admin.invitations,
      color: admin.invitations > 0 ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    },
    {
      key: FEATURE_KEYS.DISABLED,
      icon: 'user-x',
      value: admin.disabled,
      color: admin.disabled > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      key: FEATURE_KEYS.LAST_ACTIVITY,
      icon: 'clock',
      value: fit(
        admin.lastActive === null
          ? pick(TEXT.never, language)
          : ago(admin.lastActive, now, language),
        40,
      ),
    },
  ].map(({ key, icon, value, color }) => ({
    label: names[key],
    icon,
    value,
    color: color ?? WIDGET_COLORS.NEUTRAL,
  }));
}

async function get(hub, { language = 'en', settings = {} } = {}) {
  if (!hub.config) {
    return message(TEXT.waiting, language);
  }
  const problem = hub.configProblem();
  if (problem) {
    return message(problem, language);
  }
  if (!hub.read) {
    return message(TEXT.waiting, language);
  }
  const names = NAMES[language] ?? NAMES.en;
  const items = [serverRow(hub, language)];
  if (hub.server.version !== null) {
    items.push(versionRow(hub, language, names));
  }
  const showAccounts = settings.show_accounts === undefined || isTrue(settings.show_accounts);
  if (showAccounts && hub.admin) {
    items.push(...accountRows(hub, language, names));
  }
  return {
    ttl_seconds: hub.server.reachable ? 60 : 30,
    components: [{ type: 'status', items }],
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
