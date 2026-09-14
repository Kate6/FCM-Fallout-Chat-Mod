import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import discordContextService from '../../services/discordContextService';
import discordEmbedService from '../../services/discordEmbedService';
import { jsonResult, toolError } from '../result';
import { isToolError, requireActor, runMutation } from './shared';
import { recordMcpMetric } from '../../services/mcpAuditService';

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord snowflake ID');
const templateId = z.number().int().positive();
const field = z.object({ name: z.string().min(1).max(256), value: z.string().min(1).max(1024), inline: z.boolean().optional() }).strict();
const httpUrl = z.string().url().max(2048).refine(value => /^https?:\/\//.test(value), 'Expected an HTTP(S) URL');
const embed = z.object({
  title: z.string().max(256).optional(), description: z.string().max(4096).optional(), url: httpUrl.optional(),
  color: z.union([z.string().regex(/^#?[0-9a-fA-F]{6}$/), z.number().int().min(0).max(0xFFFFFF)]).optional(),
  authorName: z.string().max(256).optional(), authorIconUrl: httpUrl.optional(), authorUrl: httpUrl.optional(),
  thumbnailUrl: httpUrl.optional(), imageUrl: httpUrl.optional(), footerText: z.string().max(2048).optional(),
  footerIconUrl: httpUrl.optional(), timestamp: z.boolean().optional(), content: z.string().max(2000).optional(),
  fields: z.array(field).max(25).optional(),
}).strict();
const reactionRole = z.object({ emoji: z.string().min(1).optional(), customEmojiId: snowflake.optional(), roleId: snowflake }).strict()
  .refine(value => Boolean(value.emoji || value.customEmojiId), 'emoji or customEmojiId is required');
const recordSchema = z.record(z.string(), z.unknown());
const templateOutput = z.object({ id: templateId, name: z.string(), data: recordSchema, createdAt: z.string(), updatedAt: z.string() });

function serializeTemplate(value: { id: number; name: string; data: unknown; createdAt: Date; updatedAt: Date }) {
  return { id: value.id, name: value.name, data: value.data as Record<string, unknown>, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}

export function registerEmbedTools(server: McpServer): void {
  server.registerTool('fcm_embeds_list', {
    title: 'List embed templates', description: 'List saved Discord embed template summaries.',
    inputSchema: z.object({}).strict(), outputSchema: z.object({ templates: z.array(z.object({ id: templateId, name: z.string(), createdAt: z.string(), updatedAt: z.string() })) }),
    annotations: { title: 'List embed templates', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (_args, extra) => {
    const actor = requireActor(extra, 'fcm:read'); if (isToolError(actor)) return actor;
    try {
      const templates = await discordEmbedService.list();
      return jsonResult({ templates: templates.map(({ id, name, createdAt, updatedAt }) => ({ id, name, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() })) });
    } catch { return toolError('Embed templates are unavailable', 'service_unavailable'); }
  });

  server.registerTool('fcm_embeds_get', {
    title: 'Get embed template', description: 'Get one complete saved Discord embed template by stable numeric ID.',
    inputSchema: z.object({ id: templateId }).strict(), outputSchema: z.object({ template: templateOutput }),
    annotations: { title: 'Get embed template', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ id }, extra) => {
    const actor = requireActor(extra, 'fcm:read'); if (isToolError(actor)) return actor;
    try {
      const value = await discordEmbedService.get(id);
      return value ? jsonResult({ template: serializeTemplate(value) }) : toolError('Embed template not found', 'not_found');
    } catch { return toolError('Embed template is unavailable', 'service_unavailable'); }
  });

  server.registerTool('fcm_embed_preview', {
    title: 'Preview embed', description: 'Validate and normalize a Discord embed without saving or publishing it.',
    inputSchema: z.object({ embed }).strict(), outputSchema: z.object({ embed: recordSchema, warnings: z.array(z.string()) }),
    annotations: { title: 'Preview embed', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ embed: value }, extra) => {
    const actor = requireActor(extra, 'fcm:read'); if (isToolError(actor)) return actor;
    try { return jsonResult(discordEmbedService.preview(value)); }
    catch (error) { return toolError(error instanceof Error ? error.message : 'Invalid embed', 'invalid_embed'); }
  });

  server.registerTool('fcm_embeds_create', {
    title: 'Create embed template', description: 'Create a saved Discord embed template. Requires explicit confirmation.',
    inputSchema: z.object({ name: z.string().trim().min(1).max(100), embed, confirm: z.literal(true) }).strict(), outputSchema: z.object({ template: templateOutput }),
    annotations: { title: 'Create embed template', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ name, embed: value }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write'); if (isToolError(actor)) return actor;
    return runMutation(actor, 'embed_create', 'discord_embed', null,
      async () => ({ template: serializeTemplate(await discordEmbedService.create(name, value)) }),
      result => (result.template as { id: number }).id);
  });

  server.registerTool('fcm_embeds_update', {
    title: 'Update embed template', description: 'Replace a saved Discord embed template by stable ID. Requires explicit confirmation.',
    inputSchema: z.object({ id: templateId, name: z.string().trim().min(1).max(100), embed, confirm: z.literal(true) }).strict(), outputSchema: z.object({ template: templateOutput }),
    annotations: { title: 'Update embed template', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ id, name, embed: value }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write'); if (isToolError(actor)) return actor;
    return runMutation(actor, 'embed_update', 'discord_embed', id, async () => ({ template: serializeTemplate(await discordEmbedService.update(id, name, value)) }));
  });

  server.registerTool('fcm_embeds_delete', {
    title: 'Delete embed template', description: 'Permanently delete a saved Discord embed template. Requires explicit confirmation.',
    inputSchema: z.object({ id: templateId, confirm: z.literal(true) }).strict(), outputSchema: z.object({ deletedId: templateId }),
    annotations: { title: 'Delete embed template', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ id }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write'); if (isToolError(actor)) return actor;
    return runMutation(actor, 'embed_delete', 'discord_embed', id, async () => { await discordEmbedService.remove(id); return { deletedId: id }; });
  });

  server.registerTool('fcm_embeds_send', {
    title: 'Send Discord embed', description: 'Post an embed to a live text channel and optionally create reaction-role mappings using current assignable roles and custom emojis. Requires explicit confirmation.',
    inputSchema: z.object({ channelId: snowflake, embed, reactionRoles: z.array(reactionRole).max(20).optional(), confirm: z.literal(true) }).strict(),
    outputSchema: z.object({ sent: z.literal(true), messageId: snowflake, channelId: snowflake, reactionRoles: z.number().int().nonnegative() }),
    annotations: { title: 'Send Discord embed', readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  }, async ({ channelId, embed: value, reactionRoles = [] }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write'); if (isToolError(actor)) return actor;
    return runMutation(actor, 'embed_send', 'discord_message', channelId, async () => {
      const context = await discordContextService.getContext();
      if (!context.channels.some(channel => channel.id === channelId)) throw new Error('Target channel is not currently available');
      const assignable = new Set(context.roles.map(role => role.id));
      const resolved = reactionRoles.map(mapping => {
        if (!assignable.has(mapping.roleId)) throw new Error(`Role ${mapping.roleId} is not currently assignable`);
        if (!mapping.customEmojiId) return { emoji: mapping.emoji ?? '', roleId: mapping.roleId };
        const current = context.emojis.find(emoji => emoji.id === mapping.customEmojiId);
        if (!current) throw new Error(`Custom emoji ${mapping.customEmojiId} is no longer available`);
        return { emoji: current.name, customEmojiId: current.id, animated: current.animated, roleId: mapping.roleId };
      });
      const startedAt = performance.now();
      let sent;
      try {
        sent = await discordEmbedService.send({ channelId, embed: value, reactionRoles: resolved, suppressAudit: true });
        recordMcpMetric('discord_latency', { outcome: 'success' }, performance.now() - startedAt);
      } catch (error) {
        recordMcpMetric('discord_latency', { outcome: 'failure' }, performance.now() - startedAt);
        throw error;
      }
      return { ...sent, channelId };
    }, result => String(result.messageId));
  });
}
