import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeServerModeration, type ModerationAuthorizationDependencies } from '../serverModerationAuthorization';
const base = (): ModerationAuthorizationDependencies => ({ current: () => true, session: async () => 'account',
  account: async () => ({ discordId: 'discord', isBanned: false, kickedUntil: null }), role: async () => 'moderator' });
test('only authenticated desktop moderator/admin/owner sessions qualify', async () => {
  for (const role of ['moderator', 'admin', 'owner', 'user', 'supporter', '']) {
    assert.equal(await authorizeServerModeration('account', false, { ...base(), role: async () => role }), ['moderator', 'admin', 'owner'].includes(role));
  }
  assert.equal(await authorizeServerModeration('account', true, base()), false);
  assert.equal(await authorizeServerModeration('account', false, { ...base(), session: async () => null }), false);
  assert.equal(await authorizeServerModeration('account', false, { ...base(), session: async () => 'another-account' }), false);
  assert.equal(await authorizeServerModeration('account', false, { ...base(), current: () => false }), false);
});
test('banned/kicked/unlinked/missing accounts fail closed', async () => {
  for (const account of [null, { discordId: null, isBanned: false, kickedUntil: null },
    { discordId: 'd', isBanned: true, kickedUntil: null }, { discordId: 'd', isBanned: false, kickedUntil: new Date(Date.now() + 10000) }]) {
    assert.equal(await authorizeServerModeration('account', false, { ...base(), account: async () => account }), false);
  }
});
test('expiry or socket replacement during role lookup cannot release messages', async () => {
  let current = true; let session: string | null = 'account';
  for (const replace of [true, false]) {
    current = true; session = 'account';
    const deps = { ...base(), current: () => current, session: async () => session,
      role: async () => { if (replace) current = false; else session = null; return 'admin'; } };
    assert.equal(await authorizeServerModeration('account', false, deps), false);
  }
});
