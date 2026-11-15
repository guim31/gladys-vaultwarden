// -----------------------------------------------------------------------------
// The Gladys device: one "Vaultwarden" device for the server (one server per
// integration), external id `server:vaultwarden`.
//
// Features (category/type couples of the core table, see
// test/gladys-rules.test.js):
//   - reachable: input/binary (1 = /alive answers);
//   - response time: duration/integer in ms (the /alive request);
//   - version: text/text;
//   - with "Check for updates": update available (input/binary), latest
//     version (text/text);
//   - with the admin token: users, organizations, pending invitations,
//     disabled accounts (counter-sensor/integer), last activity (text/text,
//     the latest `lastActive` of the accounts, in the configured language).
//
// Published with should_poll: false: the integration reads the server on its
// own timer (src/hub.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const SERVER_TYPE = 'server';
export const SERVER_ID = 'vaultwarden';
export const DEVICE_NAME = 'Vaultwarden';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  REACHABLE: 'reachable',
  RESPONSE_TIME: 'response_time',
  VERSION: 'version',
  UPDATE_AVAILABLE: 'update_available',
  LATEST_VERSION: 'latest_version',
  USERS: 'users',
  ORGANIZATIONS: 'organizations',
  INVITATIONS: 'pending_invitations',
  DISABLED: 'disabled_users',
  LAST_ACTIVITY: 'last_activity',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.REACHABLE]: 'Reachable',
    [FEATURE_KEYS.RESPONSE_TIME]: 'Response time',
    [FEATURE_KEYS.VERSION]: 'Version',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Update available',
    [FEATURE_KEYS.LATEST_VERSION]: 'Latest version',
    [FEATURE_KEYS.USERS]: 'Users',
    [FEATURE_KEYS.ORGANIZATIONS]: 'Organizations',
    [FEATURE_KEYS.INVITATIONS]: 'Pending invitations',
    [FEATURE_KEYS.DISABLED]: 'Disabled accounts',
    [FEATURE_KEYS.LAST_ACTIVITY]: 'Last activity',
  },
  fr: {
    [FEATURE_KEYS.REACHABLE]: 'Joignable',
    [FEATURE_KEYS.RESPONSE_TIME]: 'Temps de réponse',
    [FEATURE_KEYS.VERSION]: 'Version',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Mise à jour disponible',
    [FEATURE_KEYS.LATEST_VERSION]: 'Dernière version',
    [FEATURE_KEYS.USERS]: 'Utilisateurs',
    [FEATURE_KEYS.ORGANIZATIONS]: 'Organisations',
    [FEATURE_KEYS.INVITATIONS]: 'Invitations en attente',
    [FEATURE_KEYS.DISABLED]: 'Comptes désactivés',
    [FEATURE_KEYS.LAST_ACTIVITY]: 'Dernière activité',
  },
  de: {
    [FEATURE_KEYS.REACHABLE]: 'Erreichbar',
    [FEATURE_KEYS.RESPONSE_TIME]: 'Antwortzeit',
    [FEATURE_KEYS.VERSION]: 'Version',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Update verfügbar',
    [FEATURE_KEYS.LATEST_VERSION]: 'Neueste Version',
    [FEATURE_KEYS.USERS]: 'Benutzer',
    [FEATURE_KEYS.ORGANIZATIONS]: 'Organisationen',
    [FEATURE_KEYS.INVITATIONS]: 'Offene Einladungen',
    [FEATURE_KEYS.DISABLED]: 'Deaktivierte Konten',
    [FEATURE_KEYS.LAST_ACTIVITY]: 'Letzte Aktivität',
  },
  es: {
    [FEATURE_KEYS.REACHABLE]: 'Accesible',
    [FEATURE_KEYS.RESPONSE_TIME]: 'Tiempo de respuesta',
    [FEATURE_KEYS.VERSION]: 'Versión',
    [FEATURE_KEYS.UPDATE_AVAILABLE]: 'Actualización disponible',
    [FEATURE_KEYS.LATEST_VERSION]: 'Última versión',
    [FEATURE_KEYS.USERS]: 'Usuarios',
    [FEATURE_KEYS.ORGANIZATIONS]: 'Organizaciones',
    [FEATURE_KEYS.INVITATIONS]: 'Invitaciones pendientes',
    [FEATURE_KEYS.DISABLED]: 'Cuentas desactivadas',
    [FEATURE_KEYS.LAST_ACTIVITY]: 'Última actividad',
  },
};

// Display bounds (the core never applies them on write). The requests time
// out after 10 s.
export const MAX_RESPONSE_MS = 10_000;
const MAX_ACCOUNTS = 100_000;

const sensor = (category, type, extra = {}) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  min: 0,
  max: 1,
  ...extra,
});

const binary = () => sensor(DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY);

const textFeature = () =>
  sensor(DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    max: 0,
  });

const counter = () =>
  sensor(DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, {
    max: MAX_ACCOUNTS,
  });

/** The local date and time, in the configured language (TZ of Gladys). */
export function formatDate(time, language) {
  if (time === null || time === undefined) {
    return null;
  }
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(time),
  );
}

const admin = ({ admin: stats }) => stats ?? null;

// Order = display order in Gladys. `when`: the feature exists only then;
// `value`: null publishes nothing (not known yet).
const FEATURES = [
  {
    key: FEATURE_KEYS.REACHABLE,
    definition: binary,
    value: ({ server }) => (server.reachable === null ? null : server.reachable ? 1 : 0),
  },
  {
    key: FEATURE_KEYS.RESPONSE_TIME,
    definition: () =>
      sensor(DEVICE_FEATURE_CATEGORIES.DURATION, DEVICE_FEATURE_TYPES.DURATION.INTEGER, {
        unit: DEVICE_FEATURE_UNITS.MILLISECONDS,
        max: MAX_RESPONSE_MS,
      }),
    // Only a server that answered has a response time.
    value: ({ server }) =>
      server.reachable && server.responseMs !== null
        ? Math.min(MAX_RESPONSE_MS, server.responseMs)
        : null,
  },
  {
    key: FEATURE_KEYS.VERSION,
    definition: textFeature,
    value: ({ server }) => server.version,
  },
  {
    key: FEATURE_KEYS.UPDATE_AVAILABLE,
    when: ({ checkUpdates }) => checkUpdates,
    definition: binary,
    value: ({ server }) =>
      server.updateAvailable === null ? null : server.updateAvailable ? 1 : 0,
  },
  {
    key: FEATURE_KEYS.LATEST_VERSION,
    when: ({ checkUpdates }) => checkUpdates,
    definition: textFeature,
    value: ({ server }) => server.latest?.version ?? null,
  },
  {
    key: FEATURE_KEYS.USERS,
    when: ({ withAdmin }) => withAdmin,
    definition: counter,
    value: (context) => admin(context)?.users ?? null,
  },
  {
    key: FEATURE_KEYS.ORGANIZATIONS,
    when: ({ withAdmin }) => withAdmin,
    definition: counter,
    value: (context) => admin(context)?.organizations ?? null,
  },
  {
    key: FEATURE_KEYS.INVITATIONS,
    when: ({ withAdmin }) => withAdmin,
    definition: counter,
    value: (context) => admin(context)?.invitations ?? null,
  },
  {
    key: FEATURE_KEYS.DISABLED,
    when: ({ withAdmin }) => withAdmin,
    definition: counter,
    value: (context) => admin(context)?.disabled ?? null,
  },
  {
    key: FEATURE_KEYS.LAST_ACTIVITY,
    when: ({ withAdmin }) => withAdmin,
    definition: textFeature,
    value: (context) => formatDate(admin(context)?.lastActive ?? null, context.language),
  },
];

export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

const featuresFor = (options) => FEATURES.filter(({ when }) => !when || when(options));

/**
 * Discovery payload of the server device.
 * @param {object} gladys
 * @param {{ language?: string, checkUpdates?: boolean, withAdmin?: boolean }} [options]
 */
export function buildServerDevice(gladys, options = {}) {
  const { language = 'en', checkUpdates = false, withAdmin = false } = options;
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: DEVICE_NAME,
    external_id: ids.device,
    should_poll: false,
    features: featuresFor({ checkUpdates, withAdmin }).map(({ key, definition }) => ({
      ...definition(),
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The value of every feature (null: nothing to publish).
 * @param {object} gladys
 * @param {object} context `{ server, admin, language, checkUpdates, withAdmin }`
 * @returns {Array<{ externalId: string, value: number|string|null }>}
 */
export function serverValues(gladys, context) {
  const ids = serverIds(gladys);
  return featuresFor(context).map(({ key, value }) => ({
    externalId: ids.feature(key),
    value: value(context),
  }));
}
