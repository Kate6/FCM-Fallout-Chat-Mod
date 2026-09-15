import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import discordContextService from '../../services/discordContextService';
import { jsonResult, toolError } from '../result';
import { isToolError, requireActor } from './shared';

export function registerDiscordContextTools(server: McpServer): void {
  server.registerTool('fcm_discord_context_get', {
    title: 'Get Discord context',
    description: 'List live Discord text channels, roles the bot can assign, and current custom server emojis with stable IDs.',
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({
      channels: z.array(z.object({ id: z.string(), name: z.string() })),
      roles: z.array(z.object({ id: z.string(), name: z.string(), color: z.number() })),
      emojis: z.array(z.object({ id: z.string(), name: z.string(), animated: z.boolean(), tag: z.string(), url: z.string() })),
      stale: z.boolean().optional(),
    }),
    annotations: { title: 'Get Discord context', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (_args, extra) => {
    const actor = requireActor(extra, 'fcm:read');
    if (isToolError(actor)) return actor;
    try { return jsonResult(await discordContextService.getContext()); }
    catch { return toolError('Discord context is unavailable', 'discord_unavailable'); }
  });
}
