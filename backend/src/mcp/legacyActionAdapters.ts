import prisma from '../config/prisma';
import logger from '../config/logger';
import { ingestMessage } from '../services/ingestMessage';
import { getCommunityStats, type StatsRange } from '../services/communityStatsService';
import { searchEntries } from '../services/wikiCatalogService';
import { searchCampItems } from '../services/campService';
import { refreshBlacklist } from '../services/nameBlacklistService';
import { resetCache, invalidateSettingsCache } from '../services/autoModService';
import { invalidateAiModerationCache } from '../services/aiModerationService';
import { invalidateVoiceCache } from '../services/voiceService';
import { invalidateModLogCache } from '../services/discordService';
import { invalidateRulesCache } from '../services/autoModEngine';
import { downloadEvidence } from '../services/banEvidenceStorage';
import { createBan, deleteMessageById, kickUser, muteUser, reverseBan, unmuteUser } from '../services/moderationActionsService';
import { getClientCount, snapshotActiveClients } from '../websocket/handlers';
import { installLegacyActionAdapter, LEGACY_ACTIONS } from './tools/actionCatalog';
import type { McpActor } from './actor';
import type { Prisma } from '@prisma/client';

type Input = Record<string, unknown>;
const text = (input: Input, key: string): string => input[key] as string;
const optionalText = (input: Input, key: string): string | undefined => input[key] as string | undefined;
const number = (input: Input, key: string): number => input[key] as number;
const optionalNumber = (input: Input, key: string): number | undefined => input[key] as number | undefined;
const optionalBoolean = (input: Input, key: string): boolean | undefined => input[key] as boolean | undefined;
const object = (input: Input, key: string): Record<string, unknown> => input[key] as Record<string, unknown>;
const array = <T>(input: Input, key: string): T[] => input[key] as T[];

async function actorUserId(actor: McpActor): Promise<string> {
  const user = await prisma.user.findUnique({ where: { discordId: actor.discordId }, select: { id: true } });
  if (!user) throw new Error('MCP actor is not linked to an FCM user');
  return user.id;
}

const readAdapters: Record<string, (input: Input, actor: McpActor) => Promise<unknown>> = {
  'health.get': async () => ({ status: 'ok', timestamp: new Date().toISOString() }),
  'version.get': async () => ({ version: process.env.npm_package_version ?? 'unknown' }),
  'channels.list': async () => prisma.channel.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, color: true, parentId: true, sortOrder: true, discordRelay: true, allowGifs: true, allowEmojis: true, isArchived: true } }),
  'commands.list': async () => prisma.chatCommand.findMany({ orderBy: { trigger: 'asc' }, select: { id: true, trigger: true, description: true, actionType: true, cooldownSec: true, requiresArgs: true, alias: true, enabled: true } }),
  'users.list': async input => prisma.user.findMany({ take: optionalNumber(input, 'limit') ?? 50, skip: optionalNumber(input, 'offset') ?? 0, orderBy: { createdAt: 'desc' }, select: { id: true, username: true, discordUsername: true, discordDisplayName: true, isBanned: true, isMuted: true, bannedUntil: true, createdAt: true } }),
  'users.get': async input => prisma.user.findUnique({ where: { id: text(input, 'userId') }, select: { id: true, username: true, discordUsername: true, discordDisplayName: true, isBanned: true, isMuted: true, bannedUntil: true, mutedUntil: true, createdAt: true } }),
  'users.search': async input => prisma.user.findMany({ where: { OR: [{ username: { contains: text(input, 'q'), mode: 'insensitive' } }, { discordUsername: { contains: text(input, 'q'), mode: 'insensitive' } }, { discordDisplayName: { contains: text(input, 'q'), mode: 'insensitive' } }] }, take: 20, select: { id: true, username: true, discordUsername: true, discordDisplayName: true, isBanned: true, isMuted: true } }),
  'messages.list': async input => (await prisma.message.findMany({ where: { channelId: text(input, 'channelId') }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, content: true, userId: true, channelId: true, source: true, createdAt: true, isDeleted: true } })).reverse(),
  'messages.search': async input => prisma.message.findMany({ where: { content: { contains: text(input, 'q'), mode: 'insensitive' }, ...(optionalText(input, 'channelId') ? { channelId: optionalText(input, 'channelId') } : {}), isDeleted: false }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, content: true, userId: true, channelId: true, source: true, createdAt: true } }),
  'parties.list': async () => prisma.party.findMany({ where: { isDeleted: false }, orderBy: { lastMessageAt: 'desc' }, take: 100, select: { id: true, name: true, color: true, isPrivate: true, category: true, description: true, maxMembers: true, lastMessageAt: true, createdAt: true } }),
  'releases.list': async () => prisma.release.findMany({ orderBy: { publishedAt: 'desc' }, take: 20, select: { id: true, version: true, downloadUrl: true, releaseNotes: true, publishedAt: true, downloadCount: true } }),
  'audit.list': async input => prisma.auditLog.findMany({ where: { ...(optionalText(input, 'actor') ? { actorId: optionalText(input, 'actor') } : {}), ...(optionalText(input, 'action') ? { action: { contains: optionalText(input, 'action'), mode: 'insensitive' } } : {}), ...(optionalText(input, 'from') || optionalText(input, 'to') ? { createdAt: { ...(optionalText(input, 'from') ? { gte: new Date(optionalText(input, 'from')!) } : {}), ...(optionalText(input, 'to') ? { lte: new Date(optionalText(input, 'to')!) } : {}) } } : {}) }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, action: true, actorId: true, targetId: true, detail: true, createdAt: true } }),
  'reports.list': async input => prisma.report.findMany({ where: { ...(optionalText(input, 'status') ? { status: optionalText(input, 'status') as 'open' | 'resolved' | 'dismissed' } : {}) }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, reporterUserId: true, targetUserId: true, reason: true, status: true, createdAt: true, resolvedAt: true } }),
  'bans.list': async input => prisma.ban.findMany({ orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, userId: true, bannedById: true, reasonText: true, reasonCategory: true, bannedUntil: true, createdAt: true, reversedAt: true } }),
  'moderation-settings.list': async () => prisma.moderationSetting.findMany({ select: { key: true, value: true, updatedAt: true } }),
  'word-filters.list': async () => prisma.wordFilter.findMany({ orderBy: { phrase: 'asc' }, select: { id: true, phrase: true, isRegex: true, testMode: true, createdAt: true } }),
  'discord-relay-mappings.list': async () => prisma.discordRelayMapping.findMany({ orderBy: { id: 'asc' }, include: { channel: { select: { name: true } } } }),
  'voice-settings.get': async () => {
    const rows = await prisma.moderationSetting.findMany({ where: { key: { in: ['voice.enabled', 'voice.lobby_channel_id', 'voice.category_id', 'voice.name_template'] } }, select: { key: true, value: true } });
    const values = new Map(rows.map(row => [row.key, row.value]));
    return { enabled: values.get('voice.enabled') === 'true', lobbyChannelId: values.get('voice.lobby_channel_id') ?? '', categoryId: values.get('voice.category_id') ?? '', nameTemplate: values.get('voice.name_template') ?? "{user}'s Channel" };
  },
  'automod-rules.list': async () => prisma.autoModRule.findMany({ orderBy: { createdAt: 'asc' } }),
  'automod-violations.list': async input => {
    const where = { ...(optionalText(input, 'ruleId') ? { ruleId: optionalText(input, 'ruleId') } : {}), ...(optionalText(input, 'userId') ? { userId: optionalText(input, 'userId') } : {}), ...(optionalText(input, 'from') || optionalText(input, 'to') ? { createdAt: { ...(optionalText(input, 'from') ? { gte: new Date(optionalText(input, 'from')!) } : {}), ...(optionalText(input, 'to') ? { lte: new Date(optionalText(input, 'to')!) } : {}) } } : {}) };
    const [items, total] = await Promise.all([prisma.autoModViolation.findMany({ where, include: { rule: { select: { name: true, triggerType: true } } }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, skip: optionalNumber(input, 'offset') ?? 0 }), prisma.autoModViolation.count({ where })]);
    return { items, total };
  },
  'reports.get': async input => prisma.report.findUnique({ where: { id: text(input, 'reportId') }, include: { reporterUser: { select: { id: true, username: true } }, targetUser: { select: { id: true, username: true } } } }),
  'player-reports.list': async input => prisma.playerReport.findMany({ where: { ...(optionalText(input, 'reportType') ? { reportType: optionalText(input, 'reportType') } : {}), ...(optionalText(input, 'status') ? { status: optionalText(input, 'status') } : {}) }, include: { user: { select: { username: true, discordUsername: true, discordAvatar: true, discordDisplayName: true } } }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50 }),
  'bans.get': async input => prisma.ban.findUnique({ where: { id: text(input, 'banId') }, include: { user: { select: { id: true, username: true, discordId: true, isBanned: true } }, evidence: { select: { id: true, type: true, mime: true, sizeBytes: true, createdAt: true } } } }),
  'evidence.list': async input => prisma.banEvidence.findMany({ where: optionalText(input, 'banId') ? { banId: optionalText(input, 'banId') } : undefined, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, banId: true, type: true, mime: true, sizeBytes: true, createdAt: true } }),
  'evidence.get': async (input, actor) => {
    if (actor.role === 'developer') throw new Error('Ban evidence requires owner or admin access');
    const item = await prisma.banEvidence.findUnique({ where: { id: text(input, 'evidenceId') }, select: { id: true, banId: true, type: true, textContent: true, objectKey: true, mime: true, sizeBytes: true, createdAt: true } });
    if (!item) return null;
    if (item.type !== 'image' || !item.objectKey) return { id: item.id, banId: item.banId, type: item.type, textContent: item.textContent, createdAt: item.createdAt };
    const stored = await downloadEvidence(item.objectKey);
    if (!stored) throw new Error('Evidence file is missing from storage');
    const chunks: Buffer[] = []; for await (const chunk of stored.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    const bytes = Buffer.concat(chunks); if (bytes.length > 10 * 1024 * 1024) throw new Error('Evidence file exceeds the MCP response limit');
    return { id: item.id, banId: item.banId, type: item.type, mimeType: stored.mime ?? item.mime, byteSize: bytes.length, fileBase64: bytes.toString('base64'), createdAt: item.createdAt };
  },
  'users.aliases': async input => prisma.userAlias.findMany({ where: { userId: text(input, 'userId') }, orderBy: { createdAt: 'desc' }, select: { id: true, alias: true, createdAt: true } }),
  'users.messages': async input => prisma.message.findMany({ where: { userId: text(input, 'userId') }, orderBy: { createdAt: 'desc' }, take: optionalNumber(input, 'limit') ?? 50, select: { id: true, channelId: true, content: true, source: true, createdAt: true, isDeleted: true } }),
  'name-blacklist.list': async () => prisma.nameBlacklistEntry.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, pattern: true, matchType: true, enabled: true, note: true, createdAt: true } }),
  'community-stats.get': async input => getCommunityStats((optionalText(input, 'range') ?? '90d') as StatsRange),
  'websocket.snapshot': async () => snapshotActiveClients(),
  'websocket.count': async () => ({ count: getClientCount() }),
  'wiki.search': async input => searchEntries(text(input, 'q'), 10),
  'camp.search': async input => searchCampItems(text(input, 'q'), 8),
};

const writeAdapters: Record<string, (input: Input, actor: McpActor) => Promise<unknown>> = {
  'messages.send': async (input, actor) => {
    const result = await ingestMessage({ userId: await actorUserId(actor), channelId: text(input, 'channelId'), rawContent: text(input, 'content').trim(), source: 'mcp' });
    if (!result.ok) throw new Error(`Message rejected: ${result.reason ?? 'unknown'}`);
    return { id: result.messageId, channelId: text(input, 'channelId'), content: text(input, 'content').trim() };
  },
  'messages.delete': async (input, actor) => { await deleteMessageById(text(input, 'messageId'), await actorUserId(actor), 'Deleted via OAuth MCP'); return { deleted: true }; },
  'bans.create': async (input, actor) => {
    const expiresAt = optionalText(input, 'expiresAt');
    return createBan(text(input, 'userId'), await actorUserId(actor), optionalText(input, 'category') ?? 'Other', text(input, 'reason'), expiresAt ? new Date(expiresAt) : null, [{ type: 'text', textContent: text(input, 'evidenceText') }]);
  },
  'bans.reverse': async (input, actor) => { await reverseBan(text(input, 'banId'), await actorUserId(actor), optionalText(input, 'reverseReason') ?? 'Reversed via OAuth MCP'); return { reversed: true }; },
  'mutes.create': async (input, actor) => muteUser(text(input, 'userId'), await actorUserId(actor), (optionalNumber(input, 'durationMinutes') ?? 60) * 60_000, optionalText(input, 'category') ?? 'Other', text(input, 'reason')),
  'mutes.delete': async (input, actor) => { await unmuteUser(text(input, 'userId'), await actorUserId(actor), 'Unmuted via OAuth MCP'); return { unmuted: true }; },
  'kicks.create': async (input, actor) => kickUser(text(input, 'userId'), await actorUserId(actor), text(input, 'reason')),
  'reports.resolve': async (input, actor) => prisma.report.update({ where: { id: text(input, 'reportId') }, data: { status: text(input, 'status') as 'resolved' | 'dismissed', notes: optionalText(input, 'resolution'), resolvedAt: new Date(), resolvedBy: await actorUserId(actor) }, select: { id: true, status: true, notes: true, resolvedAt: true } }),
  'player-reports.update': async input => prisma.playerReport.update({ where: { id: text(input, 'reportId') }, data: { status: text(input, 'status') } }),
  'messages.scrub': async input => ({ scrubbed: await prisma.message.updateMany({ where: { id: { in: array<string>(input, 'messageIds') }, content: { not: '[REDACTED]' } }, data: { content: '[REDACTED]' } }).then(result => result.count) }),
  'word-filters.create': async input => { const row = await prisma.wordFilter.create({ data: { phrase: text(input, 'phrase').toLowerCase(), isRegex: optionalBoolean(input, 'isRegex') ?? false, testMode: optionalBoolean(input, 'testMode') ?? false } }); resetCache(); return row; },
  'word-filters.update': async input => {
    const phrase = optionalText(input, 'phrase'); const testMode = optionalBoolean(input, 'testMode');
    if (phrase === undefined && testMode === undefined) throw new Error('At least one change is required');
    const row = await prisma.wordFilter.update({ where: { id: number(input, 'filterId') }, data: { ...(phrase !== undefined ? { phrase: phrase.trim() } : {}), ...(testMode !== undefined ? { testMode } : {}) } }); resetCache(); return row;
  },
  'word-filters.delete': async input => { await prisma.wordFilter.delete({ where: { id: number(input, 'filterId') } }); resetCache(); return { deleted: true }; },
  'word-filters.bulk-create': async input => { const phrases = [...new Set(array<string>(input, 'phrases').map(value => value.trim()).filter(Boolean))]; const result = await prisma.wordFilter.createMany({ data: phrases.map(phrase => ({ phrase })), skipDuplicates: true }); resetCache(); return { imported: result.count, skipped: array<string>(input, 'phrases').length - result.count }; },
  'discord-relay-mappings.create': async input => {
    if (await prisma.discordRelayMapping.count() >= 20) throw new Error('Maximum 20 relay pairs allowed per deployment');
    return prisma.discordRelayMapping.create({ data: { inGameChannelId: text(input, 'inGameChannelId'), discordChannelId: text(input, 'discordChannelId') } });
  },
  'discord-relay-mappings.delete': async input => { await prisma.discordRelayMapping.delete({ where: { id: number(input, 'mappingId') } }); return { deleted: true }; },
  'moderation-settings.update': async input => {
    const key = text(input, 'key'); const value = text(input, 'value').trim();
    if (key === 'mod_log_channel_id' && !/^\d{17,20}$/.test(value)) throw new Error('mod_log_channel_id must be a Discord snowflake');
    if (key === 'ai_moderation_enabled' && value !== 'true' && value !== 'false') throw new Error('ai_moderation_enabled must be true or false');
    if (key === 'ai_moderation_mode' && value !== 'shadow' && value !== 'enforce') throw new Error('ai_moderation_mode must be shadow or enforce');
    if (key.endsWith('_thresholds')) { const parsed: unknown = JSON.parse(value); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.values(parsed).some(score => !Number.isFinite(Number(score)) || Number(score) <= 0 || Number(score) > 1)) throw new Error('thresholds must be a JSON object with scores in (0,1]'); }
    if (key === 'spam_message_limit' || key === 'spam_window_ms') { const numeric = Number(value); if (!Number.isInteger(numeric) || numeric <= 0 || (key === 'spam_window_ms' && (numeric < 1000 || numeric > 300000))) throw new Error('Invalid numeric moderation setting'); }
    const row = await prisma.moderationSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    if (key === 'mod_log_channel_id') invalidateModLogCache(); else if (key.startsWith('ai_moderation_')) invalidateAiModerationCache(); else invalidateSettingsCache();
    return row;
  },
  'voice-settings.update': async input => {
    if (input.enabled === true && !text(input, 'lobbyChannelId')) throw new Error('lobbyChannelId is required when voice is enabled');
    const entries = [['voice.enabled', input.enabled === true ? 'true' : 'false'], ['voice.lobby_channel_id', text(input, 'lobbyChannelId')], ['voice.category_id', text(input, 'categoryId')], ['voice.name_template', text(input, 'nameTemplate').trim()]] as const;
    await prisma.$transaction(entries.map(([key, value]) => prisma.moderationSetting.upsert({ where: { key }, update: { value }, create: { key, value } }))); invalidateVoiceCache(); return { enabled: input.enabled, lobbyChannelId: text(input, 'lobbyChannelId'), categoryId: text(input, 'categoryId'), nameTemplate: text(input, 'nameTemplate').trim() };
  },
  'automod-rules.create': async (input, actor) => { const row = await prisma.autoModRule.create({ data: { name: text(input, 'name').trim(), enabled: input.enabled as boolean, triggerType: text(input, 'triggerType'), triggerMetadata: object(input, 'triggerMetadata') as Prisma.InputJsonValue, actions: array<Record<string, unknown>>(input, 'actions') as Prisma.InputJsonValue, exemptChannelIds: array<string>(input, 'exemptChannelIds'), exemptRoles: array<string>(input, 'exemptRoles'), createdById: await actorUserId(actor) } }); invalidateRulesCache(); return row; },
  'automod-rules.update': async input => { const row = await prisma.autoModRule.update({ where: { id: text(input, 'ruleId') }, data: { ...(optionalText(input, 'name') !== undefined ? { name: optionalText(input, 'name')!.trim() } : {}), ...(optionalBoolean(input, 'enabled') !== undefined ? { enabled: optionalBoolean(input, 'enabled') } : {}), ...(optionalText(input, 'triggerType') !== undefined ? { triggerType: optionalText(input, 'triggerType') } : {}), ...(input.triggerMetadata !== undefined ? { triggerMetadata: input.triggerMetadata as Prisma.InputJsonValue } : {}), ...(input.actions !== undefined ? { actions: input.actions as Prisma.InputJsonValue } : {}), ...(input.exemptChannelIds !== undefined ? { exemptChannelIds: input.exemptChannelIds as string[] } : {}), ...(input.exemptRoles !== undefined ? { exemptRoles: input.exemptRoles as string[] } : {}) } }); invalidateRulesCache(); return row; },
  'automod-rules.delete': async input => { await prisma.autoModRule.delete({ where: { id: text(input, 'ruleId') } }); invalidateRulesCache(); return { deleted: true }; },
  'automod-rules.toggle': async input => { const row = await prisma.autoModRule.update({ where: { id: text(input, 'ruleId') }, data: { enabled: input.enabled as boolean }, select: { id: true, enabled: true } }); invalidateRulesCache(); return row; },
  'name-blacklist.add': async input => {
    if (optionalText(input, 'matchType') === 'regex') new RegExp(text(input, 'pattern'), 'i');
    const result = await prisma.nameBlacklistEntry.create({ data: { pattern: text(input, 'pattern').trim(), matchType: optionalText(input, 'matchType') ?? 'exact' }, select: { id: true, pattern: true, matchType: true, createdAt: true } });
    await refreshBlacklist().catch(() => logger.warn({ action: 'mcp_blacklist_refresh', outcome: 'deferred' }, 'Blacklist cache refresh failed after committed add'));
    return result;
  },
  'name-blacklist.remove': async input => {
    await prisma.nameBlacklistEntry.delete({ where: { id: text(input, 'entryId') } });
    await refreshBlacklist().catch(() => logger.warn({ action: 'mcp_blacklist_refresh', outcome: 'deferred' }, 'Blacklist cache refresh failed after committed remove'));
    return { deleted: true };
  },
  'name-blacklist.update': async input => {
    if (optionalText(input, 'matchType') === 'regex' && optionalText(input, 'pattern')) new RegExp(optionalText(input, 'pattern')!, 'i');
    const result = await prisma.nameBlacklistEntry.update({ where: { id: text(input, 'entryId') }, data: { ...(optionalText(input, 'pattern') !== undefined ? { pattern: optionalText(input, 'pattern') } : {}), ...(optionalText(input, 'matchType') !== undefined ? { matchType: optionalText(input, 'matchType') } : {}), ...(optionalBoolean(input, 'enabled') !== undefined ? { enabled: optionalBoolean(input, 'enabled') } : {}), ...('note' in input ? { note: input.note as string | null } : {}) } });
    await refreshBlacklist().catch(() => logger.warn({ action: 'mcp_blacklist_refresh', outcome: 'deferred' }, 'Blacklist cache refresh failed after committed update')); return result;
  },
  'channels.create': async input => prisma.channel.create({ data: { name: text(input, 'name').trim(), color: optionalText(input, 'color') ?? '#ecbb51', parentId: optionalText(input, 'parentId') ?? null, sortOrder: optionalNumber(input, 'sortOrder') ?? 0, discordRelay: optionalBoolean(input, 'discordRelay') ?? false, allowGifs: optionalBoolean(input, 'allowGifs') ?? true, allowEmojis: optionalBoolean(input, 'allowEmojis') ?? true }, select: { id: true, name: true, color: true, sortOrder: true, isArchived: true } }),
  'channels.update': async input => prisma.channel.update({ where: { id: text(input, 'channelId') }, data: { ...(optionalText(input, 'name') !== undefined ? { name: optionalText(input, 'name') } : {}), ...(optionalText(input, 'color') !== undefined ? { color: optionalText(input, 'color') } : {}), ...(optionalNumber(input, 'sortOrder') !== undefined ? { sortOrder: optionalNumber(input, 'sortOrder') } : {}), ...(optionalBoolean(input, 'discordRelay') !== undefined ? { discordRelay: optionalBoolean(input, 'discordRelay') } : {}), ...(optionalBoolean(input, 'allowGifs') !== undefined ? { allowGifs: optionalBoolean(input, 'allowGifs') } : {}), ...(optionalBoolean(input, 'allowEmojis') !== undefined ? { allowEmojis: optionalBoolean(input, 'allowEmojis') } : {}), ...(optionalBoolean(input, 'isArchived') !== undefined ? { isArchived: optionalBoolean(input, 'isArchived') } : {}) }, select: { id: true, name: true, color: true, sortOrder: true, isArchived: true } }),
  'channels.archive': async input => { await prisma.channel.update({ where: { id: text(input, 'channelId') }, data: { isArchived: true } }); return { archived: true }; },
  'commands.create': async input => prisma.chatCommand.create({ data: { trigger: text(input, 'trigger').trim(), description: optionalText(input, 'description') ?? '', actionType: optionalText(input, 'actionType') ?? 'info', cooldownSec: optionalNumber(input, 'cooldownSec') ?? 0, requiresArgs: optionalBoolean(input, 'requiresArgs') ?? false, alias: optionalText(input, 'alias') ?? null, enabled: true }, select: { id: true, trigger: true, description: true, actionType: true, enabled: true } }),
  'commands.update': async input => prisma.chatCommand.update({ where: { id: number(input, 'commandId') }, data: { ...(optionalText(input, 'trigger') !== undefined ? { trigger: optionalText(input, 'trigger') } : {}), ...(optionalText(input, 'description') !== undefined ? { description: optionalText(input, 'description') } : {}), ...(optionalText(input, 'actionType') !== undefined ? { actionType: optionalText(input, 'actionType') } : {}), ...(optionalNumber(input, 'cooldownSec') !== undefined ? { cooldownSec: optionalNumber(input, 'cooldownSec') } : {}), ...(optionalBoolean(input, 'requiresArgs') !== undefined ? { requiresArgs: optionalBoolean(input, 'requiresArgs') } : {}), ...(optionalText(input, 'alias') !== undefined ? { alias: optionalText(input, 'alias') } : {}), ...(optionalBoolean(input, 'enabled') !== undefined ? { enabled: optionalBoolean(input, 'enabled') } : {}) }, select: { id: true, trigger: true, description: true, actionType: true, enabled: true } }),
  'commands.delete': async input => { await prisma.chatCommand.delete({ where: { id: number(input, 'commandId') } }); return { deleted: true }; },
};

export function installDefaultLegacyActionAdapters(): void {
  for (const action of LEGACY_ACTIONS) {
    const adapter = action.kind === 'read' ? readAdapters[action.id] : writeAdapters[action.id];
    if (!adapter) throw new Error(`Missing in-process legacy adapter: ${action.id}`);
    installLegacyActionAdapter(action.id, adapter);
  }
}

export function legacyActionAdapterIds(): readonly string[] {
  return [...Object.keys(readAdapters), ...Object.keys(writeAdapters)];
}
