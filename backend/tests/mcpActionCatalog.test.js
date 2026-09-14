'use strict';

const {
  LEGACY_ACTIONS,
  LEGACY_ACTION_CATALOG_VERSION,
  executeLegacyAction,
  installLegacyActionAdapter,
  searchLegacyActions,
} = require('../src/mcp/tools/actionCatalog');
const { installDefaultLegacyActionAdapters, legacyActionAdapterIds } = require('../src/mcp/legacyActionAdapters');

const actor = {
  discordId: '123456789012345678', clientId: 'test-client', role: 'owner', grantId: 'grant',
  scopes: ['fcm:read', 'fcm:discord:write', 'fcm:moderation:write'],
};

describe('remote legacy action catalog', () => {
  test('has stable unique IDs and an automatically derived version', () => {
    const ids = LEGACY_ACTIONS.map(action => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['users.search', 'bans.create', 'channels.update']));
    expect(LEGACY_ACTION_CATALOG_VERSION).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  test('covers every dashboard moderation capability through dedicated tools or catalog actions', () => {
    const ids = new Set(LEGACY_ACTIONS.map(action => action.id));
    expect([...ids]).toEqual(expect.arrayContaining([
      'users.list', 'users.get', 'users.search', 'users.aliases', 'users.messages',
      'messages.list', 'messages.search', 'messages.send', 'messages.delete', 'messages.scrub',
      'reports.list', 'reports.get', 'reports.resolve',
      'player-reports.list', 'player-reports.update',
      'bans.list', 'bans.get', 'bans.create', 'bans.reverse', 'kicks.create', 'mutes.create', 'mutes.delete',
      'evidence.list', 'evidence.get', 'audit.list',
      'word-filters.list', 'word-filters.create', 'word-filters.update', 'word-filters.delete', 'word-filters.bulk-create',
      'name-blacklist.list', 'name-blacklist.add', 'name-blacklist.update', 'name-blacklist.remove',
      'moderation-settings.list', 'moderation-settings.update', 'voice-settings.get', 'voice-settings.update',
      'discord-relay-mappings.list', 'discord-relay-mappings.create', 'discord-relay-mappings.delete',
      'automod-rules.list', 'automod-rules.create', 'automod-rules.update', 'automod-rules.delete', 'automod-rules.toggle',
      'automod-violations.list',
    ]));
  });

  test('every searchable action has exactly one real in-process adapter', () => {
    const ids = legacyActionAdapterIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(LEGACY_ACTIONS.map(action => action.id).sort());
    expect(() => installDefaultLegacyActionAdapters()).not.toThrow();
    for (const action of LEGACY_ACTIONS) {
      if (action.kind === 'read') expect(action.scope).toBe('fcm:read');
      else expect(action.scope).toMatch(/^fcm:(discord|moderation):write$/);
      expect(action.confirmationRequired).toBe(action.kind === 'write');
    }
  });

  test('returns ranked bounded metadata including schema, scope, and confirmation', () => {
    const results = searchLegacyActions('ban user', 2);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('bans.create');
    expect(results[0]).toEqual(expect.objectContaining({
      kind: 'write', requiredScope: 'fcm:moderation:write', confirmationRequired: true,
      inputSchema: expect.objectContaining({ type: 'object' }),
    }));
  });

  test('does not permit read/write crossover', async () => {
    await expect(executeLegacyAction('read', 'bans.create', {}, actor)).rejects.toThrow('not available through the read executor');
    await expect(executeLegacyAction('write', 'users.search', {}, actor)).rejects.toThrow('not available through the write executor');
  });

  test('strictly validates action-specific input and confirmation', async () => {
    await expect(executeLegacyAction('write', 'channels.archive', { channelId: crypto.randomUUID() }, actor))
      .rejects.toThrow();
    await expect(executeLegacyAction('read', 'users.search', { q: 'vault', endpoint: 'https://evil.invalid' }, actor))
      .rejects.toThrow();
  });

  test('dispatches only through the selected registered adapter', async () => {
    const execute = jest.fn(async input => ({ query: input.q }));
    installLegacyActionAdapter('users.search', execute);
    await expect(executeLegacyAction('read', 'users.search', { q: 'vault' }, actor)).resolves.toEqual({ query: 'vault' });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test('enforces each action scope independently', async () => {
    installLegacyActionAdapter('channels.archive', async () => ({ archived: true }));
    await expect(executeLegacyAction('write', 'channels.archive', {
      channelId: crypto.randomUUID(), confirm: true,
    }, { ...actor, scopes: ['fcm:read', 'fcm:moderation:write'] })).rejects.toThrow('fcm:discord:write');
  });
});
