import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createHash } from 'crypto';
import { z } from 'zod';
import { jsonResult, toolError } from './result';
import { registerDiscordContextTools } from './tools/discordContext';
import { registerEmbedTools } from './tools/embeds';
import { registerReactionRoleTools } from './tools/reactionRoles';
import { registerAssetTools } from './tools/assets';
import { LEGACY_ACTION_CATALOG_VERSION, registerActionCatalogTools } from './tools/actionCatalog';
import { isActor } from './actor';
import { installDefaultLegacyActionAdapters } from './legacyActionAdapters';
export type { McpActor } from './actor';

export type ToolRegistrar = (server: McpServer) => void;

// This is the single remote-tool registry. Add future Discord/embed/reaction-role
// registrars here; every stateless request constructs its server from this list.
const toolRegistry: readonly ToolRegistrar[] = [
  registerContextTool,
  registerDiscordContextTools,
  registerEmbedTools,
  registerAssetTools,
  registerReactionRoleTools,
  registerActionCatalogTools,
];

type RegisteredToolShape = {
  title?: string;
  description?: string;
  inputSchema?: z.ZodType;
  outputSchema?: z.ZodType;
  annotations?: Record<string, unknown>;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Derive a deployment catalog fingerprint from the actual registered definitions. */
export function deriveCatalogVersion(additionalRegistrars: readonly ToolRegistrar[] = []): string {
  const probe = new McpServer({ name: 'fcm-catalog-probe', version: '1.0.0' });
  for (const register of [...toolRegistry, ...additionalRegistrars]) register(probe);
  // The SDK exposes no public registry inspection API. This narrow adapter is
  // isolated here and contract-tested so upgrades fail loudly.
  const tools = (probe as unknown as { _registeredTools: Record<string, RegisteredToolShape> })._registeredTools;
  const definitions = Object.entries(tools).sort(([a], [b]) => a.localeCompare(b)).map(([name, tool]) => ({
    name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema ? z.toJSONSchema(tool.inputSchema) : {},
    outputSchema: tool.outputSchema ? z.toJSONSchema(tool.outputSchema) : {},
    annotations: tool.annotations ?? {},
  }));
  void probe.close().catch(() => undefined);
  return `sha256:${createHash('sha256').update(canonicalJson(definitions)).digest('hex').slice(0, 16)}`;
}

// Include the searchable action definitions as well as the three public catalog
// tool schemas, so adding or changing a long-tail action also changes the
// version advertised to clients automatically.
export const MCP_CATALOG_VERSION = `sha256:${createHash('sha256')
  .update(`${deriveCatalogVersion()}\n${LEGACY_ACTION_CATALOG_VERSION}`)
  .digest('hex').slice(0, 16)}`;

export function createMcpServer(): McpServer {
  installDefaultLegacyActionAdapters();
  const server = new McpServer(
    { name: 'fcm-admin', version: '1.0.0' },
    { instructions: `Manage Fallout Chat Mod. Mutation tools require the corresponding OAuth scope. Catalog ${MCP_CATALOG_VERSION}; reconnect to refresh deployed tools.` },
  );

  for (const register of toolRegistry) register(server);
  // McpServer defaults this flag to true when a tool is registered. Stateless
  // transports cannot deliver an out-of-band list_changed notification.
  server.server.registerCapabilities({ tools: { listChanged: false } });
  return server;
}

function registerContextTool(server: McpServer): void {
  // A small authenticated read tool also provides a transport smoke test. Domain
  // tools are registered separately and receive the same actor through authInfo.
  server.registerTool('fcm_context_get', {
    title: 'Get MCP actor context',
    description: 'Return the current FCM MCP actor, role, client, and granted scopes.',
    inputSchema: {},
    outputSchema: { discordId: z.string(), clientId: z.string(), role: z.enum(['owner', 'admin', 'developer']), scopes: z.array(z.string()), catalogVersion: z.string() },
    annotations: { title: 'Get MCP actor context', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (_args, extra) => {
    if (extra.signal.aborted) return toolError('Request cancelled', 'cancelled');
    const actor = extra.authInfo?.extra?.actor;
    if (!isActor(actor)) return toolError('Authenticated actor context is unavailable', 'invalid_token');
    return jsonResult({ discordId: actor.discordId, clientId: actor.clientId, role: actor.role, scopes: actor.scopes, catalogVersion: MCP_CATALOG_VERSION });
  });
}
