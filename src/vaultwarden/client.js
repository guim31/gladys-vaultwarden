// -----------------------------------------------------------------------------
// Vaultwarden client. Read only, and never a vault: no account is logged in,
// no cipher, no folder, no secret is ever requested.
//
// Public endpoints (no credential):
//   - GET /alive        -> "2026-11-15T01:21:15.055856Z" (a JSON string): the
//     health check of the official image; its duration is the response time;
//   - GET /api/version  -> "1.37.5" (a JSON string): the server version.
// Admin endpoints, only with the admin token (ADMIN_TOKEN):
//   - POST /admin, form `token=<admin token>` -> 200 and a `VW_ADMIN` session
//     cookie (Max-Age = ADMIN_SESSION_LIFETIME, 20 min by default); 401 for a
//     wrong token, 404 when the admin page is disabled (no ADMIN_TOKEN), 429
//     past ADMIN_RATELIMIT_MAX_BURST attempts. The admin API takes no Bearer
//     token, only this cookie: it is kept until it expires;
//   - GET /admin/users  -> the accounts, JSON. Only counted here: users,
//     pending invitations (`_status` 1), disabled accounts (`userEnabled`
//     false), organizations (the distinct ones among the memberships), the
//     latest `lastActive`.
// The latest release comes from the GitHub API
// (repos/dani-garcia/vaultwarden/releases/latest, `tag_name`).
// Checked against the real vaultwarden/server 1.37.5 image in Docker
// (test/fixtures/vaultwarden).
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable',
  TLS: 'tls',
  NOT_VAULTWARDEN: 'not_vaultwarden',
  HTTP: 'http',
});

export const ADMIN_ERROR_KINDS = Object.freeze({
  AUTH: 'admin_auth',
  DISABLED: 'admin_disabled',
  RATE_LIMITED: 'admin_rate_limited',
  FAILED: 'admin_failed',
});

export const GITHUB_LATEST_URL =
  'https://api.github.com/repos/dani-garcia/vaultwarden/releases/latest';

export const RELEASES_URL = 'https://github.com/dani-garcia/vaultwarden/releases';

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  // https:// on a port that speaks http.
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'EPROTO',
]);

// The admin session is renewed this long before the cookie expires.
const SESSION_MARGIN_MS = 60_000;
// Max-Age of the cookie when the server gives none (Vaultwarden's default).
const DEFAULT_SESSION_MS = 20 * 60_000;

export class VaultwardenError extends Error {
  constructor(kind, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'VaultwardenError';
    this.kind = kind;
    this.status = status;
  }
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** `1.37.5`, `v1.37.5`, `1.37.5-6ed6921c` -> [1, 37, 5]; null otherwise. */
export function parseVersion(value) {
  const match = typeof value === 'string' ? value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/) : null;
  return match ? match.slice(1).map(Number) : null;
}

/** Whether `latest` is newer than `current`; null when either is not a version. */
export function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) {
    return null;
  }
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) {
      return a[i] > b[i];
    }
  }
  return false;
}

/** A date of the admin API (`2026-11-15 01:22:34 +00:00`), in ms; null otherwise. */
export function parseAdminTime(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2}:\d{2})$/);
  const time = Date.parse(match ? `${match[1]}T${match[2]}${match[3]}` : value);
  return Number.isNaN(time) ? null : time;
}

/** The counts of the account list of /admin/users. */
export function summarizeUsers(list) {
  const users = Array.isArray(list) ? list.filter((user) => user && typeof user === 'object') : [];
  const organizations = new Set();
  let lastActive = null;
  for (const user of users) {
    for (const org of Array.isArray(user.organizations) ? user.organizations : []) {
      if (org && typeof org.id === 'string') {
        organizations.add(org.id);
      }
    }
    const time = parseAdminTime(user.lastActive);
    if (time !== null && (lastActive === null || time > lastActive)) {
      lastActive = time;
    }
  }
  const invited = users.filter((user) => user._status === 1).length;
  return {
    users: users.length - invited,
    invitations: invited,
    disabled: users.filter((user) => user.userEnabled === false).length,
    organizations: organizations.size,
    lastActive,
  };
}

/** The `VW_ADMIN` cookie of a Set-Cookie header, with its lifetime. */
function sessionCookie(headers) {
  const raw = headers?.['set-cookie'];
  const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of lines) {
    const match = line.match(/^\s*(VW_ADMIN=[^;]*)/);
    if (match) {
      const maxAge = line.match(/;\s*Max-Age=(\d+)/i);
      return { cookie: match[1], lifetimeMs: maxAge ? Number(maxAge[1]) * 1000 : null };
    }
  }
  return null;
}

/**
 * @param {object} options
 * @param {string} options.url base address (src/config.js parseServerUrl)
 * @param {string} [options.adminToken]
 * @param {boolean} [options.insecure]
 * @param {() => number} [options.now]
 * @param {typeof httpRequest} [request]
 */
export function createClient({ url, adminToken = '', insecure = false, now }, request) {
  const send = request ?? httpRequest;
  const clock = now ?? (() => Date.now());
  let session = null;

  async function call(path, options = {}) {
    try {
      return await send(`${url}${path}`, { insecure, ...options });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new VaultwardenError(ERROR_KINDS.TLS, `certificate refused (${err.code})`, {
          cause: err,
        });
      }
      throw new VaultwardenError(
        ERROR_KINDS.UNREACHABLE,
        `unreachable (${err.code ?? err.message})`,
        { cause: err },
      );
    }
  }

  /** A public endpoint that answers a JSON string. */
  async function getString(path) {
    const response = await call(path);
    const { status } = response;
    const body = parseJson(response.body);
    if (status === 404 || (status >= 200 && status < 300 && typeof body !== 'string')) {
      // A reverse proxy's page, another service on this port, Bitwarden...
      throw new VaultwardenError(ERROR_KINDS.NOT_VAULTWARDEN, `no Vaultwarden at ${path}`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      throw new VaultwardenError(ERROR_KINDS.HTTP, `HTTP ${status} on ${path}`, { status });
    }
    return body;
  }

  /** An admin request: a network error there is an admin failure, /alive just answered. */
  async function callAdmin(path, options) {
    try {
      return await call(path, options);
    } catch (err) {
      throw new VaultwardenError(
        ADMIN_ERROR_KINDS.FAILED,
        `admin request failed (${err.message})`,
        {
          cause: err,
        },
      );
    }
  }

  async function login() {
    session = null;
    const response = await callAdmin('/admin', { method: 'POST', form: { token: adminToken } });
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new VaultwardenError(ADMIN_ERROR_KINDS.AUTH, 'admin token refused', { status });
    }
    if (status === 404) {
      throw new VaultwardenError(ADMIN_ERROR_KINDS.DISABLED, 'admin page disabled', { status });
    }
    if (status === 429) {
      throw new VaultwardenError(ADMIN_ERROR_KINDS.RATE_LIMITED, 'admin login rate limited', {
        status,
      });
    }
    const found = status >= 200 && status < 400 ? sessionCookie(response.headers) : null;
    if (!found) {
      throw new VaultwardenError(ADMIN_ERROR_KINDS.FAILED, `admin login failed (HTTP ${status})`, {
        status,
      });
    }
    const lifetime = found.lifetimeMs ?? DEFAULT_SESSION_MS;
    session = {
      cookie: found.cookie,
      expiresAt: clock() + Math.max(0, lifetime - SESSION_MARGIN_MS),
    };
  }

  async function getUsers() {
    const response = await callAdmin('/admin/users', { headers: { cookie: session.cookie } });
    return response;
  }

  return {
    /** Health and version: `{ responseMs, version }`. */
    async readServer() {
      const started = clock();
      await getString('/alive');
      const responseMs = Math.max(0, Math.round(clock() - started));
      const version = await getString('/api/version');
      return { responseMs, version: version.trim() || null };
    },

    /** The account counts, through an admin session (renewed when needed). */
    async readAdmin() {
      if (!session || clock() >= session.expiresAt) {
        await login();
      }
      let response = await getUsers();
      if (response.status === 401) {
        // The session ended early (the server restarted, its lifetime is shorter).
        await login();
        response = await getUsers();
      }
      const body = parseJson(response.body);
      if (response.status !== 200 || !Array.isArray(body)) {
        session = response.status === 401 ? null : session;
        throw new VaultwardenError(
          ADMIN_ERROR_KINDS.FAILED,
          `unexpected answer from /admin/users (HTTP ${response.status})`,
          { status: response.status },
        );
      }
      return summarizeUsers(body);
    },
  };
}

/**
 * The latest release of Vaultwarden on GitHub (60 anonymous requests an hour
 * per address: the hub asks a few times a day).
 * @returns {Promise<{ version: string, url: string }>}
 */
export async function readLatestRelease(request = httpRequest) {
  const response = await request(GITHUB_LATEST_URL, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'gladys-vaultwarden',
    },
  });
  const body = parseJson(response.body);
  if (response.status !== 200 || !body || !parseVersion(body.tag_name)) {
    throw new Error(`GitHub answered HTTP ${response.status}`);
  }
  return {
    version: body.tag_name.replace(/^v/, ''),
    url:
      typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/')
        ? body.html_url
        : RELEASES_URL,
  };
}
