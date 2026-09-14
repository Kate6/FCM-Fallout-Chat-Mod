import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import reactionRoleService from '../../services/reactionRoleService';
import { jsonResult, toolError } from '../result';
import { isToolError, requireActor, runMutation } from './shared';

const snowflake = z.string().regex(/^\d{17,20}$/, 'Expected a Discord snowflake ID');
const mapping = z.object({ emoji: z.string(), matchKey: z.string(), reactValue: z.string(), roleId: snowflake, roleName: z.string().optional() });

export function registerReactionRoleTools(server: McpServer): void {
  server.registerTool('fcm_reaction_role_panels_list', {
    title: 'List reaction-role panels', description: 'List active Discord reaction-role panels and their stable message, channel, guild, emoji, and role IDs.',
    inputSchema: z.object({}).strict(), outputSchema: z.object({ panels: z.array(z.object({ messageId: snowflake, channelId: snowflake, guildId: snowflake, mappings: z.array(mapping), createdAt: z.string() })) }),
    annotations: { title: 'List reaction-role panels', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (_args, extra) => {
    const actor = requireActor(extra, 'fcm:read'); if (isToolError(actor)) return actor;
    try {
      const panels = await reactionRoleService.listPanels();
      return jsonResult({ panels: panels.map(panel => ({ ...panel, createdAt: panel.createdAt.toISOString() })) });
    } catch { return toolError('Reaction-role panels are unavailable', 'service_unavailable'); }
  });

  server.registerTool('fcm_reaction_role_panels_delete', {
    title: 'Deactivate reaction-role panel', description: 'Deactivate a reaction-role panel while preserving its Discord message. Requires explicit confirmation.',
    inputSchema: z.object({ messageId: snowflake, confirm: z.literal(true) }).strict(), outputSchema: z.object({ deactivatedMessageId: snowflake }),
    annotations: { title: 'Deactivate reaction-role panel', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
  }, async ({ messageId }, extra) => {
    const actor = requireActor(extra, 'fcm:discord:write'); if (isToolError(actor)) return actor;
    return runMutation(actor, 'reaction_role_panel_delete', 'discord_message', messageId, async () => {
      const removed = await reactionRoleService.deletePanel(messageId);
      if (!removed) throw new Error('Reaction-role panel not found');
      return { deactivatedMessageId: messageId };
    });
  });
}
