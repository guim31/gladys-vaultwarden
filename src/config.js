// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds. One reading is
// two small requests (/alive and /api/version): 30 s is cheap.
export const POLL_INTERVALS = ['30', '60', '300', '900'];

export const DEFAULT_CONFIG = {
  url: '',
  admin_token: '',
  insecure: false,
  check_updates: true,
  poll_interval: '60',
  language: 'fr',
};

/**
 * Parse the address of the Vaultwarden server: a bare host or IP
 * (`192.0.2.10`, http on port 80 then), `host:port`, or a URL
 * (`https://vault.example.com`, or with a sub-path when DOMAIN has one:
 * `https://example.com/vault`). Query and fragment are dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, without a final
 *   slash; null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  // The address of the web vault, often copied with its #/login fragment.
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

const isTrue = (value) => value === true || value === 'true';
const isFalse = (value) => value === false || value === 'false';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const typed = typeof source.url === 'string' ? source.url.trim() : '';
  const url = parseServerUrl(typed);
  const interval = POLL_INTERVALS.includes(String(source.poll_interval ?? ''))
    ? String(source.poll_interval)
    : DEFAULT_CONFIG.poll_interval;
  return {
    url,
    invalidUrl: typed !== '' && url === null,
    // A token pasted with a new line or spaces around it.
    adminToken: typeof source.admin_token === 'string' ? source.admin_token.trim() : '',
    insecure: isTrue(source.insecure),
    // On unless explicitly turned off (an older configuration has no value).
    checkUpdates: !isFalse(source.check_updates),
    pollIntervalMs: Number(interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
