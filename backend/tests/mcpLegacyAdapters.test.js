'use strict';

jest.mock('../src/config/prisma', () => require('./setup/prisma-stub'));
jest.mock('../src/services/ingestMessage', () => ({ ingestMessage: jest.fn() }));
jest.mock('../src/services/communityStatsService', () => ({ getCommunityStats: jest.fn() }));
jest.mock('../src/services/wikiCatalogService', () => ({ searchEntries: jest.fn() }));
jest.mock('../src/services/campService', () => ({ searchCampItems: jest.fn() }));
jest.mock('../src/services/nameBlacklistService', () => ({ refreshBlacklist: jest.fn() }));
jest.mock('../src/services/autoModService', () => ({ resetCache: jest.fn(), invalidateSettingsCache: jest.fn() }));
jest.mock('../src/services/aiModerationService', () => ({ invalidateAiModerationCache: jest.fn() }));
jest.mock('../src/services/voiceService', () => ({ invalidateVoiceCache: jest.fn() }));
jest.mock('../src/services/discordService', () => ({ invalidateModLogCache: jest.fn() }));
jest.mock('../src/services/autoModEngine', () => ({ invalidateRulesCache: jest.fn() }));
jest.mock('../src/services/banEvidenceStorage', () => ({ downloadEvidence: jest.fn() }));
jest.mock('../src/services/moderationActionsService', () => ({
  deleteMessageById: jest.fn(), kickUser: jest.fn(), muteUser: jest.fn(),
  createBan: jest.fn(), reverseBan: jest.fn(), unmuteUser: jest.fn(),
}));
jest.mock('../src/websocket/handlers', () => ({ getClientCount: jest.fn(), snapshotActiveClients: jest.fn() }));

const prisma = require('./setup/prisma-stub').default;
const { executeLegacyAction } = require('../src/mcp/tools/actionCatalog');
const { installDefaultLegacyActionAdapters } = require('../src/mcp/legacyActionAdapters');

const actor = {
  discordId: '123456789012345678', clientId: 'test-client', role: 'owner', grantId: 'grant',
  scopes: ['fcm:read', 'fcm:discord:write', 'fcm:moderation:write'],
};

describe('legacy in-process action adapters', () => {
  beforeAll(() => installDefaultLegacyActionAdapters());
  beforeEach(() => jest.clearAllMocks());

  test('read adapter calls the database directly with bounded parameters', async () => {
    prisma.user.findMany.mockResolvedValueOnce([{ id: 'user-1' }]);
    await expect(executeLegacyAction('read', 'users.search', { q: 'vault' }, actor)).resolves.toEqual([{ id: 'user-1' }]);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
  });

  test('Discord write adapter performs the selected domain mutation without HTTP', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    prisma.channel.create.mockResolvedValueOnce({ id: 'channel-1', name: 'Trading' });
    await expect(executeLegacyAction('write', 'channels.create', { name: 'Trading', confirm: true }, actor))
      .resolves.toEqual({ id: 'channel-1', name: 'Trading' });
    expect(prisma.channel.create).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('moderation adapter resolves the OAuth actor and uses the shared moderation service', async () => {
    const { kickUser } = require('../src/services/moderationActionsService');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'actor-user' });
    kickUser.mockResolvedValueOnce({ disconnected: 1 });
    await expect(executeLegacyAction('write', 'kicks.create', {
      userId: crypto.randomUUID(), reason: 'spam', confirm: true,
    }, actor)).resolves.toEqual({ disconnected: 1 });
    expect(kickUser).toHaveBeenCalledWith(expect.any(String), 'actor-user', 'spam');
  });

  test('preserves legacy confirmation and not-found behavior at the adapter boundary', async () => {
    await expect(executeLegacyAction('write', 'channels.archive', {
      channelId: crypto.randomUUID(), confirm: false,
    }, actor)).rejects.toThrow();

    prisma.channel.update.mockRejectedValueOnce(new Error('Record to update not found'));
    await expect(executeLegacyAction('write', 'channels.archive', {
      channelId: crypto.randomUUID(), confirm: true,
    }, actor)).rejects.toThrow('Record to update not found');
  });

  test('preserves the legacy selected record while enforcing the new OAuth scope denial', async () => {
    const row = { id: 'channel-1', name: 'General', isArchived: false };
    prisma.channel.findMany.mockResolvedValueOnce([row]);
    await expect(executeLegacyAction('read', 'channels.list', {}, actor)).resolves.toEqual([row]);
    await expect(executeLegacyAction('write', 'channels.archive', {
      channelId: crypto.randomUUID(), confirm: true,
    }, { ...actor, scopes: ['fcm:read', 'fcm:moderation:write'] })).rejects.toThrow('fcm:discord:write');
  });

  test('creates a ban through the protected moderation service with required evidence', async () => {
    const { createBan } = require('../src/services/moderationActionsService');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'actor-user' });
    createBan.mockResolvedValueOnce({ banId: 'ban-1', disconnected: 1, discordLockdown: { stripped: [], voiceDisconnected: false, guildBanApplied: false, warnings: [] } });
    const userId = crypto.randomUUID();
    await expect(executeLegacyAction('write', 'bans.create', {
      userId, reason: 'spam', evidenceText: 'Captured chat transcript', confirm: true,
    }, actor)).resolves.toEqual(expect.objectContaining({ banId: 'ban-1' }));
    expect(createBan).toHaveBeenCalledWith(userId, 'actor-user', 'Other', 'spam', null, [{ type: 'text', textContent: 'Captured chat transcript' }]);
  });

  test.each([
    ['name-blacklist.add', { pattern: 'blocked', confirm: true }, 'create', { id: 'entry-1', pattern: 'blocked' }],
    ['name-blacklist.remove', { entryId: crypto.randomUUID(), confirm: true }, 'delete', { deleted: true }],
  ])('%s stays successful when post-commit cache refresh fails', async (actionId, input, method, expected) => {
    const { refreshBlacklist } = require('../src/services/nameBlacklistService');
    prisma.nameBlacklistEntry[method].mockResolvedValueOnce(expected);
    refreshBlacklist.mockRejectedValueOnce(new Error('secret cache failure detail'));
    await expect(executeLegacyAction('write', actionId, input, actor)).resolves.toEqual(expected);
    expect(refreshBlacklist).toHaveBeenCalledTimes(1);
  });

  test('runs AutoMod CRUD through validated in-process adapters and invalidates the cache', async () => {
    const { invalidateRulesCache } = require('../src/services/autoModEngine');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'actor-user' });
    prisma.autoModRule.create.mockResolvedValueOnce({ id: crypto.randomUUID(), name: 'Links' });
    await expect(executeLegacyAction('write', 'automod-rules.create', {
      name: 'Links', enabled: true, triggerType: 'LINK', triggerMetadata: { allow_list: ['example.com'] },
      actions: [{ type: 'BLOCK' }], exemptChannelIds: [], exemptRoles: [], confirm: true,
    }, actor)).resolves.toEqual(expect.objectContaining({ name: 'Links' }));
    expect(prisma.autoModRule.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdById: 'actor-user', triggerType: 'LINK' }) }));
    expect(invalidateRulesCache).toHaveBeenCalledTimes(1);
  });

  test('scrubs only explicitly selected message IDs', async () => {
    const messageIds = [crypto.randomUUID(), crypto.randomUUID()];
    prisma.message.updateMany.mockResolvedValueOnce({ count: 2 });
    await expect(executeLegacyAction('write', 'messages.scrub', { messageIds, confirm: true }, actor)).resolves.toEqual({ scrubbed: 2 });
    expect(prisma.message.updateMany).toHaveBeenCalledWith({ where: { id: { in: messageIds }, content: { not: '[REDACTED]' } }, data: { content: '[REDACTED]' } });
  });

  test('restricts private evidence bodies to owner/admin MCP actors', async () => {
    await expect(executeLegacyAction('read', 'evidence.get', { evidenceId: crypto.randomUUID() }, { ...actor, role: 'developer' })).rejects.toThrow('owner or admin');
    expect(prisma.banEvidence.findUnique).not.toHaveBeenCalled();
  });
});
