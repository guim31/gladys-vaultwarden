// -----------------------------------------------------------------------------
// The Vaultwarden client, the configuration and the HTTP helper: real answers
// of Vaultwarden 1.37.5 (test/fixtures), errors, versions, addresses.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { normalizeConfig, parseServerUrl } from '../src/config.js';
import {
  ADMIN_ERROR_KINDS,
  ERROR_KINDS,
  createClient,
  isNewer,
  parseAdminTime,
  parseVersion,
  readLatestRelease,
  summarizeUsers,
} from '../src/vaultwarden/client.js';
import { httpRequest } from '../src/vaultwarden/http.js';
import {
  ADMIN_TOKEN,
  FIXTURES,
  FakeVaultwarden,
  SERVER_URL,
  createNetwork,
} from './helpers/fakeVaultwarden.js';

test('the server address: bare host, port, https, sub-path, fragment', () => {
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10');
  assert.equal(parseServerUrl(' 192.0.2.10:8080 '), 'http://192.0.2.10:8080');
  assert.equal(parseServerUrl('https://vault.example.com/'), 'https://vault.example.com');
  assert.equal(parseServerUrl('https://example.com/vault/#/login'), 'https://example.com/vault');
  assert.equal(parseServerUrl('vault.lan:8443/vw?x=1'), 'http://vault.lan:8443/vw');
  for (const bad of [
    '',
    'ftp://192.0.2.10',
    'https://user:pass@vault.example.com',
    'http://',
    42,
  ]) {
    assert.equal(parseServerUrl(bad), null, String(bad));
  }
});

test('the configuration is normalized, update check on by default', () => {
  const config = normalizeConfig({ url: 'nope://x', admin_token: '  token \n' });
  assert.equal(config.invalidUrl, true);
  assert.equal(config.adminToken, 'token');
  assert.equal(config.checkUpdates, true);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ check_updates: 'false' }).checkUpdates, false);
  assert.equal(normalizeConfig({ poll_interval: '900' }).pollIntervalMs, 900_000);
  assert.equal(normalizeConfig({ poll_interval: '7' }).pollIntervalMs, 60_000);
});

test('versions: parsed, compared, testing builds included', () => {
  assert.deepEqual(parseVersion('1.37.5'), [1, 37, 5]);
  assert.deepEqual(parseVersion('v1.37.5'), [1, 37, 5]);
  assert.deepEqual(parseVersion('1.37.5-6ed6921c'), [1, 37, 5]);
  assert.equal(parseVersion('testing'), null);
  assert.equal(isNewer('1.38.0', '1.37.5'), true);
  assert.equal(isNewer('1.37.10', '1.37.9'), true);
  assert.equal(isNewer('1.37.5', '1.37.5'), false);
  assert.equal(isNewer('1.37.5', '1.38.0'), false);
  assert.equal(isNewer('1.37.5', null), null);
});

test('the account list of the real /admin/users is counted, nothing else kept', () => {
  assert.deepEqual(summarizeUsers(FIXTURES.users), {
    users: 2,
    invitations: 2,
    disabled: 1,
    organizations: 1,
    lastActive: Date.parse('2026-11-15T01:22:34Z'),
  });
  assert.equal(parseAdminTime('2026-11-15 01:22:34 +00:00'), Date.parse('2026-11-15T01:22:34Z'));
  assert.equal(parseAdminTime(null), null);
  assert.deepEqual(summarizeUsers([]), {
    users: 0,
    invitations: 0,
    disabled: 0,
    organizations: 0,
    lastActive: null,
  });
});

const clientFor = (server, options = {}) =>
  createClient({ url: SERVER_URL, adminToken: ADMIN_TOKEN, ...options }, createNetwork(server));

test('readServer: version and response time; errors by kind', async () => {
  const server = new FakeVaultwarden();
  let time = 1000;
  const client = clientFor(server, { now: () => (time += 21) });
  assert.deepEqual(await client.readServer(), { responseMs: 21, version: '1.37.5' });
  server.online = false;
  await assert.rejects(client.readServer(), { kind: ERROR_KINDS.UNREACHABLE });
  server.online = true;
  server.status = 502;
  server.body = 'Bad gateway';
  await assert.rejects(client.readServer(), { kind: ERROR_KINDS.HTTP });
  server.status = 404;
  await assert.rejects(client.readServer(), { kind: ERROR_KINDS.NOT_VAULTWARDEN });
  server.status = 200;
  server.body = '{"status":"ok"}';
  await assert.rejects(client.readServer(), { kind: ERROR_KINDS.NOT_VAULTWARDEN });
  const tls = createClient({ url: SERVER_URL }, async () => {
    throw Object.assign(new Error('self-signed'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  });
  await assert.rejects(tls.readServer(), { kind: ERROR_KINDS.TLS });
});

test('readAdmin: the token is sent as a form, then only the cookie', async () => {
  const server = new FakeVaultwarden();
  const client = clientFor(server);
  await client.readAdmin();
  await client.readAdmin();
  const [login, ...reads] = server.requests;
  assert.equal(login.method, 'POST');
  assert.deepEqual(login.options.form, { token: ADMIN_TOKEN });
  assert.equal(reads.length, 2);
  for (const read of reads) {
    assert.match(read.options.headers.cookie, /^VW_ADMIN=jwt-1$/);
    assert.ok(!JSON.stringify(read.options).includes(ADMIN_TOKEN));
  }
});

test('readAdmin: refused token, disabled page, rate limit', async () => {
  await assert.rejects(clientFor(new FakeVaultwarden(), { adminToken: 'bad' }).readAdmin(), {
    kind: ADMIN_ERROR_KINDS.AUTH,
  });
  await assert.rejects(clientFor(new FakeVaultwarden({ adminToken: null })).readAdmin(), {
    kind: ADMIN_ERROR_KINDS.DISABLED,
  });
  const limited = new FakeVaultwarden();
  limited.rateLimited = true;
  await assert.rejects(clientFor(limited).readAdmin(), { kind: ADMIN_ERROR_KINDS.RATE_LIMITED });
});

test('the latest release is read from GitHub with a user agent', async () => {
  const server = new FakeVaultwarden();
  const network = createNetwork(server);
  assert.deepEqual(await readLatestRelease(network), {
    version: '1.37.5',
    url: 'https://github.com/dani-garcia/vaultwarden/releases/tag/1.37.5',
  });
  assert.equal(server.requests[0].options.headers['user-agent'], 'gladys-vaultwarden');
  await assert.rejects(
    readLatestRelease(async () => ({ status: 403, headers: {}, body: '{"message":"rate"}' })),
  );
});

test('the HTTP helper sends a form and returns the Set-Cookie header', async (t) => {
  let received;
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      received = { type: request.headers['content-type'], body };
      response.setHeader('set-cookie', ['VW_ADMIN=abc; Path=/admin; Max-Age=1200']);
      response.end('"ok"');
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const response = await httpRequest(`http://127.0.0.1:${port}/admin`, {
    method: 'POST',
    form: { token: 'a b&c' },
  });
  assert.equal(received.type, 'application/x-www-form-urlencoded');
  assert.equal(received.body, 'token=a+b%26c');
  assert.deepEqual(response.headers['set-cookie'], ['VW_ADMIN=abc; Path=/admin; Max-Age=1200']);
});
