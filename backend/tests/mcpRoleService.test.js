'use strict';
jest.mock('../src/config/prisma', () => require('./setup/prisma-stub'));
jest.mock('../src/services/discordService', () => ({ getDiscordClient: jest.fn() }));
const envModule = require('../src/config/environment');
const env = envModule.default || envModule;
const { McpRoleService } = require('../src/services/mcpRoleService');

const base = { findUser: jest.fn(), isIdentityBanned: jest.fn(), findAdmin: jest.fn(), fetchGuildRoles: jest.fn(), now: jest.fn() };
describe('mcpRoleService', () => {
  beforeEach(() => {
    jest.clearAllMocks(); base.findUser.mockResolvedValue({ isBanned: false }); base.isIdentityBanned.mockResolvedValue(false);
    base.findAdmin.mockResolvedValue(null); base.now.mockReturnValue(1000);
    env.PROD_GUILD_ID = 'prod'; env.DEV_GUILD_ID = 'dev'; env.PROD_DEVELOPER_ROLE_ID = 'prod-role'; env.DEV_DEVELOPER_ROLE_ID = 'dev-role';
  });
  it.each(['owner', 'admin'])('allows authoritative %s records', async (role) => {
    base.findAdmin.mockResolvedValue({ role });
    expect(await new McpRoleService(base).authorize('42')).toEqual({ authorized: true, role });
  });
  it('excludes moderators', async () => {
    base.findAdmin.mockResolvedValue({ role: 'moderator' }); base.fetchGuildRoles.mockResolvedValue([]);
    expect(await new McpRoleService(base).authorize('42')).toMatchObject({ authorized: false });
  });
  it('requires the developer role in both guilds', async () => {
    base.fetchGuildRoles.mockImplementation(async (guild) => guild === 'prod' ? ['prod-role'] : ['dev-role']);
    expect(await new McpRoleService(base).authorize('42')).toEqual({ authorized: true, role: 'developer' });
  });
  it('fails closed when a guild lookup fails', async () => {
    base.fetchGuildRoles.mockRejectedValue(new Error('Discord down'));
    expect(await new McpRoleService(base).authorize('42')).toEqual({ authorized: false, reason: 'verification_unavailable' });
  });
  it('does not cache bans and caps positive cache at five minutes', async () => {
    base.findAdmin.mockResolvedValue({ role: 'admin' });
    const svc = new McpRoleService(base, 9999999);
    expect((await svc.authorize('42')).authorized).toBe(true);
    base.findUser.mockResolvedValue({ isBanned: true });
    expect(await svc.authorize('42')).toEqual({ authorized: false, reason: 'banned' });
  });
  it('rechecks role after the five-minute positive cache expires', async () => {
    base.findAdmin.mockResolvedValueOnce({ role: 'admin' }).mockResolvedValueOnce(null);
    base.fetchGuildRoles.mockResolvedValue([]);
    const svc = new McpRoleService(base, 9999999);
    expect((await svc.authorize('42')).authorized).toBe(true);
    base.now.mockReturnValue(301001);
    expect(await svc.authorize('42')).toEqual({ authorized: false, reason: 'role_missing' });
    expect(base.findAdmin).toHaveBeenCalledTimes(2);
  });
  it('denies provider-level banned identities', async () => {
    base.isIdentityBanned.mockResolvedValue(true);
    expect(await new McpRoleService(base).authorize('42')).toEqual({ authorized: false, reason: 'banned' });
  });
});
