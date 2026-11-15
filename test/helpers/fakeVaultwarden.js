// -----------------------------------------------------------------------------
// An in-memory Vaultwarden and GitHub, built on real answers of the
// vaultwarden/server 1.37.5 image in Docker and of the GitHub API
// (test/fixtures/vaultwarden, ids invented). It answers through `request`,
// the seam of src/vaultwarden/http.js; tests never touch the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GITHUB_LATEST_URL } from '../../src/vaultwarden/client.js';

const load = (name) =>
  readFileSync(new URL(`../fixtures/vaultwarden/${name}`, import.meta.url), 'utf8');

export const FIXTURES = {
  alive: load('alive.json'),
  version: JSON.parse(load('version.json')),
  users: JSON.parse(load('admin-users.json')),
  github: JSON.parse(load('github-latest.json')),
  notFound: load('admin-disabled.html'),
};

export const ADMIN_TOKEN = 'test-admin-token-123';
export const SERVER_URL = 'http://192.0.2.10';
// The fixtures were captured on 2026-11-15 around 01:22 UTC.
export const FIXTURE_CLOCK = Date.parse('2026-11-15T02:00:00Z');

const json = (status, body, headers = {}) => ({ status, headers, body: JSON.stringify(body) });
const html = (status, body = '<html></html>', headers = {}) => ({
  status,
  headers: { 'content-type': 'text/html', ...headers },
  body,
});

export class FakeVaultwarden {
  /**
   * @param {object} [options]
   * @param {string|null} [options.adminToken] null: the admin page is disabled
   */
  constructor({ adminToken = ADMIN_TOKEN, version = FIXTURES.version } = {}) {
    this.adminToken = adminToken;
    this.version = version;
    this.users = structuredClone(FIXTURES.users);
    this.online = true;
    this.status = null; // force an HTTP status on the public endpoints
    this.body = null; // force a raw body on the public endpoints
    this.sessions = new Set();
    this.sessionSeconds = 1200;
    this.rateLimited = false;
    this.github = { online: true, tag: FIXTURES.github.tag_name };
    this.requests = [];
    this.logins = 0;
  }

  /** Every session ends (Vaultwarden restarted). */
  dropSessions() {
    this.sessions.clear();
  }

  answer(url, { method = 'GET', headers = {}, form } = {}) {
    if (url === GITHUB_LATEST_URL) {
      if (!this.github.online) {
        throw Object.assign(new Error('getaddrinfo EAI_AGAIN api.github.com'), {
          code: 'EAI_AGAIN',
        });
      }
      return json(200, {
        ...FIXTURES.github,
        tag_name: this.github.tag,
        html_url: `https://github.com/dani-garcia/vaultwarden/releases/tag/${this.github.tag}`,
      });
    }
    if (!url.startsWith(`${SERVER_URL}/`)) {
      throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
    }
    if (!this.online) {
      throw Object.assign(new Error('connect ECONNREFUSED 192.0.2.10:80'), {
        code: 'ECONNREFUSED',
      });
    }
    const path = url.slice(SERVER_URL.length);
    if (path === '/alive' || path === '/api/version') {
      if (this.status !== null || this.body !== null) {
        return { status: this.status ?? 200, headers: {}, body: this.body ?? '' };
      }
      return path === '/alive'
        ? { status: 200, headers: {}, body: FIXTURES.alive }
        : json(200, this.version);
    }
    if (path === '/admin' && method === 'POST') {
      this.logins += 1;
      if (this.adminToken === null) {
        return html(404, FIXTURES.notFound);
      }
      if (this.rateLimited) {
        return html(429);
      }
      if (form?.token !== this.adminToken) {
        return html(401);
      }
      const cookie = `jwt-${this.logins}`;
      this.sessions.add(cookie);
      return html(200, '<html>admin</html>', {
        'set-cookie': [
          `VW_ADMIN=${cookie}; HttpOnly; SameSite=Strict; Path=/admin; Max-Age=${this.sessionSeconds}`,
        ],
      });
    }
    if (path === '/admin/users') {
      if (this.adminToken === null) {
        return html(404, FIXTURES.notFound);
      }
      const cookie = /VW_ADMIN=([^;]*)/.exec(headers.cookie ?? '')?.[1];
      if (!cookie || !this.sessions.has(cookie)) {
        return html(401);
      }
      return json(200, this.users);
    }
    return html(404, FIXTURES.notFound);
  }
}

/** The `request` seam of the client, answered by `server`. */
export function createNetwork(server) {
  return async (url, options = {}) => {
    server.requests.push({ url, method: options.method ?? 'GET', options });
    return server.answer(url, options);
  };
}
