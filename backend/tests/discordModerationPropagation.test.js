'use strict';

const member = {
  kick: jest.fn(),
  timeout: jest.fn(),
  roles: { cache: new Map(), remove: jest.fn() },
  voice: { channelId: null, disconnect: jest.fn() },
};
const guild = {
  id: 'guild-1',
  members: { fetch: jest.fn().mockResolvedValue(member), fetchMe: jest.fn() },
  bans: { create: jest.fn(), remove: jest.fn() },
  roles: { cache: new Map() },
};

jest.mock('../src/config/environment', () => ({ __esModule: true, default: { DISCORD_SERVER_ID: 'guild-1' } }));
jest.mock('../src/config/logger', () => ({ __esModule: true, default: { warn: jest.fn() } }));
jest.mock('../src/config/prisma', () => ({
  __esModule: true,
  default: {
    user: { update: jest.fn(), findUnique: jest.fn() },
    ban: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    device: { updateMany: jest.fn() },
  },
}));
jest.mock('../src/websocket/handlers', () => ({ broadcast: jest.fn(), notifyAndDisconnect: jest.fn(() => 0), markClientMuted: jest.fn(), broadcastMessageDeletion: jest.fn(), disconnectByUserId: jest.fn() }));
jest.mock('../src/services/discordService', () => ({ getDiscordClient: jest.fn(() => ({ guilds: { fetch: jest.fn().mockResolvedValue(guild) } })), postModAlert: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/services/userRoleService', () => ({ isProtectedTarget: jest.fn().mockResolvedValue(false) }));
jest.mock('../src/services/relay/tokenService', () => ({ revokeTokensForLinkedUser: jest.fn() }));
jest.mock('../src/services/relay/relayHandler', () => ({ evictRelayUser: jest.fn().mockResolvedValue(0) }));

const prisma = require('../src/config/prisma').default;
const { kickUser, muteUser, createBan } = require('../src/services/moderationActionsService');

describe('Discord slash moderation propagation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.update.mockResolvedValue({ discordId: 'target-discord' });
    prisma.user.findUnique.mockResolvedValue({ discordId: 'target-discord', username: 'Target' });
    prisma.ban.create.mockResolvedValue({ id: 'ban-1' });
    prisma.auditLog.create.mockResolvedValue({});
    member.kick.mockResolvedValue(undefined);
    member.timeout.mockResolvedValue(undefined);
    guild.bans.create.mockResolvedValue(undefined);
    guild.members.fetch.mockResolvedValue(member);
    guild.members.fetchMe.mockResolvedValue({ roles: { highest: { position: 100 } } });
  });

  test('optional Discord kick removes the linked guild member', async () => {
    const result = await kickUser('target', 'actor', 'spam', { kickDiscord: true });

    expect(member.kick).toHaveBeenCalledWith('FCM kick: spam');
    expect(result.discordKicked).toBe(true);
  });

  test('mute records Discord propagation only after the native timeout succeeds', async () => {
    const result = await muteUser('target', 'actor', 60_000, 'Spam', 'spam');

    expect(member.timeout).toHaveBeenCalledWith(60_000, 'Spam: spam');
    expect(result.discordPropagated).toBe(true);
  });

  test('the slash-ban option applies a guild ban even for an expiring FCM ban', async () => {
    const until = new Date(Date.now() + 60_000);
    const result = await createBan('target', 'actor', 'Spam', 'spam', until, [{ type: 'text', textContent: 'evidence' }], { banDiscord: true });

    expect(guild.bans.create).toHaveBeenCalledWith('target-discord', expect.objectContaining({ reason: 'Spam: spam', deleteMessageSeconds: 0 }));
    expect(result.discordLockdown.guildBanApplied).toBe(true);
  });
});
