import env from '../config/environment';
import prisma from '../config/prisma';
import { getDiscordClient } from './discordService';

export type McpStaffRole = 'owner' | 'admin' | 'developer';
export type McpRoleResult =
  | { authorized: true; role: McpStaffRole }
  | { authorized: false; reason: 'banned' | 'role_missing' | 'verification_unavailable' };

export interface McpRoleDependencies {
  findUser(discordId: string): Promise<{ isBanned: boolean } | null>;
  isIdentityBanned(discordId: string): Promise<boolean>;
  findAdmin(discordId: string): Promise<{ role: string } | null>;
  fetchGuildRoles(guildId: string, discordId: string): Promise<string[]>;
  now(): number;
}

const MAX_POSITIVE_CACHE_MS = 5 * 60 * 1000;

function defaultDependencies(): McpRoleDependencies {
  return {
    findUser: (discordId) => prisma.user.findUnique({ where: { discordId }, select: { isBanned: true } }),
    isIdentityBanned: async (discordId) => Boolean(await prisma.bannedIdentity.findUnique({
      where: { provider_providerUid: { provider: 'discord', providerUid: discordId } }, select: { id: true },
    })),
    findAdmin: (discordId) => prisma.adminUser.findUnique({ where: { discordId }, select: { role: true } }),
    fetchGuildRoles: async (guildId, discordId) => {
      const client = getDiscordClient();
      if (!client) throw new Error('Discord bot is unavailable');
      const guild = await client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordId);
      return [...member.roles.cache.keys()];
    },
    now: Date.now,
  };
}

export class McpRoleService {
  private readonly positive = new Map<string, { role: McpStaffRole; expiresAt: number }>();

  constructor(
    private readonly deps: McpRoleDependencies = defaultDependencies(),
    cacheTtlMs = MAX_POSITIVE_CACHE_MS,
  ) {
    this.cacheTtlMs = Math.min(MAX_POSITIVE_CACHE_MS, Math.max(0, cacheTtlMs));
  }

  private readonly cacheTtlMs: number;

  async authorize(discordId: string): Promise<McpRoleResult> {
    // Ban checks are deliberately never cached: a newly imposed ban must take
    // effect on the next protected request.
    const [user, identityBanned] = await Promise.all([
      this.deps.findUser(discordId), this.deps.isIdentityBanned(discordId),
    ]);
    if (user?.isBanned || identityBanned) {
      this.positive.delete(discordId);
      return { authorized: false, reason: 'banned' };
    }

    const cached = this.positive.get(discordId);
    if (cached && cached.expiresAt > this.deps.now()) return { authorized: true, role: cached.role };
    this.positive.delete(discordId);

    // admin_users is the authoritative source for owner/admin. Moderators are
    // intentionally excluded from MCP access.
    const admin = await this.deps.findAdmin(discordId);
    const normalized = admin?.role.trim().toLowerCase();
    if (normalized === 'owner' || normalized === 'admin') return this.cache(discordId, normalized);

    if (!env.PROD_GUILD_ID || !env.DEV_GUILD_ID || !env.PROD_DEVELOPER_ROLE_ID || !env.DEV_DEVELOPER_ROLE_ID) {
      return { authorized: false, reason: 'verification_unavailable' };
    }
    try {
      // Uses the service bot, never a persisted Discord OAuth token. Both
      // memberships are required and dependency failure is fail-closed.
      const [prodRoles, devRoles] = await Promise.all([
        this.deps.fetchGuildRoles(env.PROD_GUILD_ID, discordId),
        this.deps.fetchGuildRoles(env.DEV_GUILD_ID, discordId),
      ]);
      if (prodRoles.includes(env.PROD_DEVELOPER_ROLE_ID) && devRoles.includes(env.DEV_DEVELOPER_ROLE_ID)) {
        return this.cache(discordId, 'developer');
      }
      return { authorized: false, reason: 'role_missing' };
    } catch {
      return { authorized: false, reason: 'verification_unavailable' };
    }
  }

  invalidate(discordId: string): void { this.positive.delete(discordId); }

  private cache(discordId: string, role: McpStaffRole): McpRoleResult {
    if (this.cacheTtlMs > 0) this.positive.set(discordId, { role, expiresAt: this.deps.now() + this.cacheTtlMs });
    return { authorized: true, role };
  }
}

export const mcpRoleService = new McpRoleService();
