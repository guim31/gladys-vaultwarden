// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the admin token, never the session cookie.
// (Adapted from guim31/gladys-headscale.)
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_TOKEN, CONFIG, createWorld } from './helpers/world.js';

/** Capture the lines of the SDK logger at `level`. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

test('a normal reading cycle writes nothing at info, admin and GitHub readings included', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.ok(logs.texts().some((text) => text.includes('Vaultwarden 1.37.5: reachable')));
  logs.clear();
  for (let i = 0; i < 30; i += 1) {
    w.clock.advance(60 * 60_000);
    w.server.users[1].lastActive = '2026-11-16 08:00:00 +00:00';
    await w.hub.poll();
  }
  assert.ok(w.server.logins > 1, 'the admin session was renewed');
  assert.deepEqual(logs.texts(), []);
});

test('an outage is logged once when it starts and once when it ends', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(60_000);
    await w.hub.poll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  w.server.online = true;
  await w.hub.poll();
  assert.equal(logs.lines.length, 2);
  assert.match(logs.texts()[1], /reachable again/);
});

test('GitHub out of reach is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await createWorld();
  t.after(() => w.app.stop());
  logs.clear();
  w.server.github.online = false;
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(7 * 3_600_000);
    await w.hub.poll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.texts()[0], /GitHub/);
});

test('neither the admin token nor the session cookie is written, even in debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  for (const config of [CONFIG, { ...CONFIG, admin_token: 'wrong-secret-token' }]) {
    const w = await createWorld({ config });
    t.after(() => w.app.stop());
    w.clock.advance(3_600_000);
    w.server.dropSessions();
    await w.hub.poll();
    await w.fake.action('test_connection', {});
  }
  const all = logs.texts().join('\n');
  assert.ok(logs.lines.length > 0);
  assert.ok(!all.includes('secret-token'), 'no admin token in the logs');
  assert.ok(!all.includes(ADMIN_TOKEN));
  assert.ok(!all.includes('jwt-'), 'no session cookie');
});
