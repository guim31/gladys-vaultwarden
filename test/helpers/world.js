// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Vaultwarden (and
// GitHub) on a fake network and a manual clock, with the integration wired on
// top through registerHandlers. No timer runs unless `timers: true` (with
// node:test mock timers): the tests read the server with `world.hub.poll()`.
// (Adapted from guim31/gladys-headscale.)
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { serverIds } from '../../src/devices.js';
import {
  ADMIN_TOKEN,
  FIXTURES,
  FIXTURE_CLOCK,
  FakeVaultwarden,
  SERVER_URL,
  createNetwork,
} from './fakeVaultwarden.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';
// Dates are formatted in the time zone of Gladys.
process.env.TZ = 'Europe/Paris';

/** A manual clock. */
export function createClock(start = FIXTURE_CLOCK) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: '192.0.2.10', admin_token: ADMIN_TOKEN, language: 'en' };
export const PUBLIC_CONFIG = { url: '192.0.2.10', language: 'en' };

/**
 * @param {object} [options]
 * @param {object} [options.serverOptions] FakeVaultwarden options
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  serverOptions = {},
  server = new FakeVaultwarden(serverOptions),
  config = CONFIG,
  devices = [],
  connect = true,
  timings = {},
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    request: createNetwork(server),
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server, app, hub: app.hub, clock };
}

export const serverIdsOf = (gladys) => serverIds(gladys);

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { ADMIN_TOKEN, FIXTURES, FakeVaultwarden, SERVER_URL };
