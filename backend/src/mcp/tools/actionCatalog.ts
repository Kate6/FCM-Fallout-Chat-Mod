import { createHash } from 'crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpActor } from '../actor';
import { jsonResult, toolError } from '../result';
import { isToolError, requireActor, runMutation } from './shared';

export type LegacyScope = 'fcm:read' | 'fcm:discord:write' | 'fcm:moderation:write';
export type LegacyKind = 'read' | 'write';

export interface LegacyAction {
  readonly id: string;
  readonly description: string;
  readonly kind: LegacyKind;
  readonly scope: LegacyScope;
  readonly confirmationRequired: boolean;
  readonly schema: z.ZodObject<z.ZodRawShape>;
  readonly execute: (input: Record<string, unknown>, actor: McpActor) => Promise<unknown>;
}

const empty = z.object({}).strict();
const uuid = z.string().uuid();
const bounded = z.string().trim().min(1).max(500);
const limit100 = z.number().int().min(1).max(100).optional();
const confirm = z.literal(true);
const jsonObject = z.record(z.string(), z.unknown());
const snowflake = z.string().regex(/^\d{17,20}$/);
const automodAction = z.object({
  type: z.enum(['BLOCK', 'ALERT', 'TIMEOUT', 'MUTE_OVERLAY']),
  metadata: jsonObject.optional(),
}).strict();

// Adapters are registered by the application composition root. They call domain
// services directly; arbitrary paths, methods and URLs are deliberately absent.
const adapters = new Map<string, LegacyAction['execute']>();

export function installLegacyActionAdapter(id: string, execute: LegacyAction['execute']): void {
  if (!ACTION_BY_ID.has(id)) throw new Error(`Unknown legacy action: ${id}`);
  adapters.set(id, execute);
}

async function dispatch(id: string, input: Record<string, unknown>, actor: McpActor): Promise<unknown> {
  const adapter = adapters.get(id);
  if (!adapter) throw new Error(`Legacy action adapter is unavailable: ${id}`);
  return adapter(input, actor);
}

function read(id: string, description: string, schema = empty): LegacyAction {
  return { id, description, kind: 'read', scope: 'fcm:read', confirmationRequired: false, schema,
    execute: (input, actor) => dispatch(id, input, actor) };
}

function write(id: string, description: string, scope: Exclude<LegacyScope, 'fcm:read'>, schema: z.ZodObject<z.ZodRawShape>): LegacyAction {
  return { id, description, kind: 'write', scope, confirmationRequired: true,
    schema: schema.extend({ confirm }).strict(), execute: (input, actor) => dispatch(id, input, actor) };
}

export const LEGACY_ACTIONS: readonly LegacyAction[] = [
  read('health.get', 'Check backend health.'),
  read('version.get', 'Get the deployed backend version.'),
  read('channels.list', 'List FCM chat channels.'),
  read('commands.list', 'List configured chat commands.'),
  read('users.list', 'List users.', z.object({ limit: limit100, offset: z.number().int().min(0).optional() }).strict()),
  read('users.get', 'Get one user.', z.object({ userId: uuid }).strict()),
  read('users.search', 'Search users.', z.object({ q: z.string().trim().min(1).max(64) }).strict()),
  read('messages.list', 'List recent channel messages.', z.object({ channelId: uuid, limit: limit100 }).strict()),
  read('messages.search', 'Search message content.', z.object({ q: z.string().trim().min(1).max(200), channelId: uuid.optional(), limit: limit100 }).strict()),
  read('parties.list', 'List active parties.'),
  read('releases.list', 'List recent overlay releases.'),
  read('audit.list', 'List audit records.', z.object({ actor: uuid.optional(), action: z.string().max(100).optional(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), limit: z.number().int().min(1).max(200).optional() }).strict()),
  read('reports.list', 'List player reports.', z.object({ status: z.enum(['open', 'resolved', 'dismissed']).optional(), limit: limit100 }).strict()),
  read('bans.list', 'List bans.', z.object({ limit: limit100 }).strict()),
  read('moderation-settings.list', 'List moderation settings.'),
  read('word-filters.list', 'List chat word-filter entries.'),
  read('discord-relay-mappings.list', 'List Discord-to-FCM channel relay mappings.'),
  read('voice-settings.get', 'Get join-to-create voice settings.'),
  read('automod-rules.list', 'List AutoMod rules.'),
  read('automod-violations.list', 'List AutoMod violations.', z.object({ ruleId: uuid.optional(), userId: uuid.optional(), from: z.iso.datetime().optional(), to: z.iso.datetime().optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).max(10_000).optional() }).strict()),
  read('reports.get', 'Get one report with its message context.', z.object({ reportId: uuid }).strict()),
  read('player-reports.list', 'List submitted player and bug reports.', z.object({ reportType: z.enum(['player', 'bug']).optional(), status: z.enum(['open', 'reviewed', 'closed']).optional(), limit: z.number().int().min(1).max(200).optional() }).strict()),
  read('bans.get', 'Get one ban and evidence metadata.', z.object({ banId: uuid }).strict()),
  read('evidence.list', 'List ban evidence metadata. File bodies and private object keys are never returned.', z.object({ banId: uuid.optional(), limit: z.number().int().min(1).max(200).optional() }).strict()),
  read('evidence.get', 'Read one ban evidence item. Image bytes are base64 encoded; owner/admin only.', z.object({ evidenceId: uuid }).strict()),
  read('users.aliases', 'List a user’s historical aliases.', z.object({ userId: uuid }).strict()),
  read('users.messages', 'List recent messages by a user.', z.object({ userId: uuid, limit: limit100 }).strict()),
  read('name-blacklist.list', 'List name blacklist entries.'),
  read('community-stats.get', 'Get community statistics.', z.object({ range: z.enum(['all', '90d', '60d', '30d', '7d', '1d']).optional() }).strict()),
  read('websocket.snapshot', 'Inspect active WebSocket clients.'),
  read('websocket.count', 'Count active WebSocket clients.'),
  read('wiki.search', 'Search the Fallout wiki.', z.object({ q: z.string().trim().min(1).max(200) }).strict()),
  read('camp.search', 'Search CAMP reference data.', z.object({ q: z.string().trim().min(1).max(200) }).strict()),

  write('messages.send', 'Send a governed FCM chat message.', 'fcm:discord:write', z.object({ channelId: uuid, content: bounded })),
  write('messages.delete', 'Soft-delete a chat message.', 'fcm:moderation:write', z.object({ messageId: uuid })),
  write('bans.create', 'Ban a user with required text evidence.', 'fcm:moderation:write', z.object({ userId: uuid, reason: bounded, evidenceText: z.string().trim().min(1).max(8000), category: z.string().max(100).optional(), expiresAt: z.iso.datetime().optional() })),
  write('bans.reverse', 'Reverse a ban.', 'fcm:moderation:write', z.object({ banId: uuid, reverseReason: bounded.optional() })),
  write('mutes.create', 'Mute a user.', 'fcm:moderation:write', z.object({ userId: uuid, reason: bounded, category: z.string().max(100).optional(), durationMinutes: z.number().int().positive().max(525_600).optional() })),
  write('mutes.delete', 'Unmute a user.', 'fcm:moderation:write', z.object({ userId: uuid })),
  write('kicks.create', 'Kick a user.', 'fcm:moderation:write', z.object({ userId: uuid, reason: bounded })),
  write('reports.resolve', 'Resolve or dismiss a report.', 'fcm:moderation:write', z.object({ reportId: uuid, status: z.enum(['resolved', 'dismissed']), resolution: bounded.optional() })),
  write('player-reports.update', 'Update the review status of a player or bug report.', 'fcm:moderation:write', z.object({ reportId: uuid, status: z.enum(['open', 'reviewed', 'closed']) })),
  write('messages.scrub', 'Replace the content of up to 100 messages with [REDACTED].', 'fcm:moderation:write', z.object({ messageIds: z.array(uuid).min(1).max(100) })),
  write('word-filters.create', 'Create a chat word-filter entry.', 'fcm:moderation:write', z.object({ phrase: z.string().trim().min(1).max(500), isRegex: z.boolean().default(false), testMode: z.boolean().default(false) })),
  write('word-filters.update', 'Update a chat word-filter entry.', 'fcm:moderation:write', z.object({ filterId: z.number().int().positive(), phrase: z.string().trim().min(1).max(500).optional(), testMode: z.boolean().optional() })),
  write('word-filters.delete', 'Delete a chat word-filter entry.', 'fcm:moderation:write', z.object({ filterId: z.number().int().positive() })),
  write('word-filters.bulk-create', 'Create multiple unique word-filter phrases.', 'fcm:moderation:write', z.object({ phrases: z.array(z.string().trim().min(1).max(500)).min(1).max(500) })),
  write('discord-relay-mappings.create', 'Create a Discord-to-FCM channel relay mapping.', 'fcm:moderation:write', z.object({ inGameChannelId: uuid, discordChannelId: snowflake })),
  write('discord-relay-mappings.delete', 'Delete a Discord-to-FCM relay mapping.', 'fcm:moderation:write', z.object({ mappingId: z.number().int().positive() })),
  write('moderation-settings.update', 'Update one supported moderation setting.', 'fcm:moderation:write', z.object({ key: z.enum(['spam_message_limit', 'spam_window_ms', 'mod_log_channel_id', 'ai_moderation_enabled', 'ai_moderation_mode', 'ai_moderation_thresholds', 'ai_moderation_identifier_thresholds']), value: z.string().min(1).max(4000) })),
  write('voice-settings.update', 'Replace join-to-create voice settings.', 'fcm:moderation:write', z.object({ enabled: z.boolean(), lobbyChannelId: snowflake.or(z.literal('')), categoryId: snowflake.or(z.literal('')), nameTemplate: z.string().trim().min(1).max(100) })),
  write('automod-rules.create', 'Create an AutoMod rule.', 'fcm:moderation:write', z.object({ name: z.string().trim().min(1).max(100), enabled: z.boolean().default(true), triggerType: z.enum(['AI_MODERATION', 'KEYWORD', 'SPAM', 'KEYWORD_PRESET', 'MENTION_SPAM', 'LINK']), triggerMetadata: jsonObject, actions: z.array(automodAction).min(1).max(10), exemptChannelIds: z.array(uuid).max(100).default([]), exemptRoles: z.array(snowflake).max(100).default([]) })),
  write('automod-rules.update', 'Update an AutoMod rule.', 'fcm:moderation:write', z.object({ ruleId: uuid, name: z.string().trim().min(1).max(100).optional(), enabled: z.boolean().optional(), triggerType: z.enum(['AI_MODERATION', 'KEYWORD', 'SPAM', 'KEYWORD_PRESET', 'MENTION_SPAM', 'LINK']).optional(), triggerMetadata: jsonObject.optional(), actions: z.array(automodAction).min(1).max(10).optional(), exemptChannelIds: z.array(uuid).max(100).optional(), exemptRoles: z.array(snowflake).max(100).optional() })),
  write('automod-rules.delete', 'Delete an AutoMod rule.', 'fcm:moderation:write', z.object({ ruleId: uuid })),
  write('automod-rules.toggle', 'Enable or disable an AutoMod rule.', 'fcm:moderation:write', z.object({ ruleId: uuid, enabled: z.boolean() })),
  write('name-blacklist.add', 'Add a name blacklist entry.', 'fcm:moderation:write', z.object({ pattern: z.string().trim().min(1).max(200), matchType: z.enum(['exact', 'contains', 'regex']).optional() })),
  write('name-blacklist.remove', 'Remove a name blacklist entry.', 'fcm:moderation:write', z.object({ entryId: uuid })),
  write('name-blacklist.update', 'Update a name blacklist entry.', 'fcm:moderation:write', z.object({ entryId: uuid, pattern: z.string().trim().min(1).max(128).optional(), matchType: z.enum(['exact', 'contains', 'regex']).optional(), enabled: z.boolean().optional(), note: z.string().max(512).nullable().optional() })),
  write('channels.create', 'Create an FCM channel.', 'fcm:discord:write', z.object({ name: z.string().trim().min(1).max(100), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), parentId: uuid.nullable().optional(), sortOrder: z.number().int().optional(), discordRelay: z.boolean().optional(), allowGifs: z.boolean().optional(), allowEmojis: z.boolean().optional() })),
  write('channels.update', 'Update an FCM channel.', 'fcm:discord:write', z.object({ channelId: uuid, name: z.string().trim().min(1).max(100).optional(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), sortOrder: z.number().int().optional(), discordRelay: z.boolean().optional(), allowGifs: z.boolean().optional(), allowEmojis: z.boolean().optional(), isArchived: z.boolean().optional() })),
  write('channels.archive', 'Archive an FCM channel.', 'fcm:discord:write', z.object({ channelId: uuid })),
  write('commands.create', 'Create a chat command.', 'fcm:discord:write', z.object({ trigger: z.string().trim().min(1).max(100), description: z.string().max(500).optional(), actionType: z.string().max(100).optional(), cooldownSec: z.number().int().min(0).optional(), requiresArgs: z.boolean().optional(), alias: z.string().max(100).nullable().optional() })),
  write('commands.update', 'Update a chat command.', 'fcm:discord:write', z.object({ commandId: z.number().int().positive(), trigger: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional(), actionType: z.string().max(100).optional(), cooldownSec: z.number().int().min(0).optional(), requiresArgs: z.boolean().optional(), alias: z.string().max(100).nullable().optional(), enabled: z.boolean().optional() })),
  write('commands.delete', 'Delete a chat command.', 'fcm:discord:write', z.object({ commandId: z.number().int().positive() })),
] as const;

const ACTION_BY_ID = new Map(LEGACY_ACTIONS.map(action => [action.id, action]));

function publicAction(action: LegacyAction) {
  return { id: action.id, description: action.description, kind: action.kind, requiredScope: action.scope,
    confirmationRequired: action.confirmationRequired, inputSchema: z.toJSONSchema(action.schema) };
}

export const LEGACY_ACTION_CATALOG_VERSION = `sha256:${createHash('sha256')
  .update(JSON.stringify(LEGACY_ACTIONS.map(publicAction)))
  .digest('hex').slice(0, 16)}`;

function score(action: LegacyAction, terms: readonly string[]): number {
  const haystack = `${action.id} ${action.description}`.toLowerCase();
  return terms.reduce((total, term) => total + (action.id.includes(term) ? 4 : haystack.includes(term) ? 1 : 0), 0);
}

export function searchLegacyActions(query: string, limit = 10): ReturnType<typeof publicAction>[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return LEGACY_ACTIONS.map((action, index) => ({ action, index, rank: score(action, terms) }))
    .filter(result => terms.length === 0 || result.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .slice(0, Math.min(limit, 20)).map(result => publicAction(result.action));
}

function actionOrError(id: string, kind: LegacyKind): LegacyAction | ReturnType<typeof toolError> {
  const action = ACTION_BY_ID.get(id);
  if (!action) return toolError('Unknown action ID. Use fcm_actions_search first.', 'unknown_action');
  if (action.kind !== kind) return toolError(`Action ${id} is not available through the ${kind} executor`, 'action_kind_mismatch');
  return action;
}

function isLegacyAction(value: LegacyAction | ReturnType<typeof toolError>): value is LegacyAction {
  return 'execute' in value;
}

/** Testable dispatch boundary shared by the MCP handlers. */
export async function executeLegacyAction(kind: LegacyKind, actionId: string, input: unknown, actor: McpActor): Promise<unknown> {
  const action = actionOrError(actionId, kind);
  if (!isLegacyAction(action)) throw new Error((action.content[0] as { text: string }).text);
  if (!actor.scopes.includes(action.scope)) throw new Error(`OAuth scope ${action.scope} is required`);
  const parsed = action.schema.parse(input);
  return action.execute(parsed, actor);
}

export function registerActionCatalogTools(server: McpServer): void {
  server.registerTool('fcm_actions_search', {
    title: 'Search FCM actions', description: 'Search the bounded legacy FCM action catalog. Returns exact IDs, schemas, scopes, and confirmation requirements.',
    inputSchema: { query: z.string().max(200).default(''), limit: z.number().int().min(1).max(20).default(10) },
    outputSchema: { catalogVersion: z.string(), actions: z.array(z.record(z.string(), z.unknown())) },
    annotations: { title: 'Search FCM actions', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ query, limit }, extra) => {
    const actor = requireActor(extra, 'fcm:read');
    if (isToolError(actor)) return actor;
    return jsonResult({ catalogVersion: LEGACY_ACTION_CATALOG_VERSION, actions: searchLegacyActions(query, limit) });
  });

  server.registerTool('fcm_action_read', {
    title: 'Run FCM read action', description: 'Execute one cataloged read-only action. Cannot execute mutations.',
    inputSchema: { actionId: z.string().min(1).max(100), input: z.record(z.string(), z.unknown()).default({}) },
    outputSchema: { value: z.unknown().optional() },
    annotations: { title: 'Run FCM read action', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ actionId, input }, extra) => {
    const actor = requireActor(extra, 'fcm:read');
    if (isToolError(actor)) return actor;
    const action = actionOrError(actionId, 'read');
    if (!isLegacyAction(action)) return action;
    const parsed = action.schema.safeParse(input);
    if (!parsed.success) return toolError('Input does not match the selected action schema', 'invalid_action_input');
    try { return jsonResult(await action.execute(parsed.data, actor)); }
    catch { return toolError('The legacy action failed', 'operation_failed'); }
  });

  server.registerTool('fcm_action_write', {
    title: 'Run FCM write action', description: 'Execute one cataloged mutation with its required write scope and confirm:true. Cannot execute reads.',
    inputSchema: { actionId: z.string().min(1).max(100), input: z.record(z.string(), z.unknown()) },
    outputSchema: { actionId: z.string(), result: z.unknown() },
    annotations: { title: 'Run FCM write action', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ actionId, input }, extra) => {
    const action = actionOrError(actionId, 'write');
    if (!isLegacyAction(action)) return action;
    const actor = requireActor(extra, action.scope);
    if (isToolError(actor)) return actor;
    const parsed = action.schema.safeParse(input);
    if (!parsed.success) return toolError('Input does not match the selected action schema; confirm:true is required', 'invalid_action_input');
    return runMutation(actor, `legacy_${action.id.replaceAll('.', '_')}`, 'legacy_action', action.id,
      async () => ({ actionId: action.id, result: await action.execute(parsed.data, actor) }));
  });
}
