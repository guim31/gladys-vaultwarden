// -----------------------------------------------------------------------------
// The `server` widget: its content follows the vocabulary and the budget of
// the core (validateWidgetContent), in every language and state.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { CONFIG, PUBLIC_CONFIG, createAll, createWorld } from './helpers/world.js';

async function content(world, request = {}) {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, ...request });
  assert.equal(ack.success, true, ack.error);
  const { content: result } = ack.data;
  validateWidgetContent(result);
  return result;
}

const rows = (result) => result.components[0].items;

test('the widget lists the server, the version and the accounts', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  for (const language of ['en', 'fr', 'de', 'es']) {
    const result = await content(w, { language });
    assert.equal(result.components.length, 1);
    assert.equal(rows(result).length, 7, language);
  }
  const result = await content(w, { language: 'fr' });
  assert.deepEqual(
    // Intl separates with narrow no-break spaces.
    rows(result).map((row) => [row.label, String(row.value).replace(/\s/gu, ' ')]),
    [
      ['Vaultwarden', 'Joignable · 0 ms'],
      ['Version', '1.37.5 · à jour'],
      ['Utilisateurs', '2'],
      ['Organisations', '1'],
      ['Invitations en attente', '2'],
      ['Comptes désactivés', '1'],
      ['Dernière activité', 'il y a 37 min'],
    ],
  );
});

test('the accounts can be hidden, and are absent without admin token', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  assert.equal(rows(await content(w, { settings: { show_accounts: false } })).length, 2);
  const p = await createWorld({ config: PUBLIC_CONFIG });
  t.after(() => p.app.stop());
  assert.equal(rows(await content(p)).length, 2);
});

test('an update and an unreachable server are shown in color', async (t) => {
  const w = await createWorld({ serverOptions: { version: '1.36.0' } });
  t.after(() => w.app.stop());
  const [, version] = rows(await content(w));
  assert.deepEqual(version, {
    label: 'Update available',
    icon: 'download',
    value: '1.36.0 → 1.37.5',
    color: 'warning',
  });
  w.server.online = false;
  await w.hub.poll();
  const [server] = rows(await content(w));
  assert.equal(server.value, 'Unreachable');
  assert.equal(server.color, 'danger');
});

test('the widget shows the name given in Gladys', async (t) => {
  const w = await createWorld();
  t.after(() => w.app.stop());
  await createAll(w);
  await w.fake.deviceUpdated({ ...w.fake.devices[0], name: 'Family vault' });
  assert.equal(rows(await content(w))[0].label, 'Family vault');
});

test('without address: the configuration problem, as text', async (t) => {
  const w = await createWorld({ config: { ...CONFIG, url: '' } });
  t.after(() => w.app.stop());
  const result = await content(w, { language: 'de' });
  assert.equal(result.components[0].type, 'text');
  assert.match(result.components[0].text, /Gib die Adresse/);
});
