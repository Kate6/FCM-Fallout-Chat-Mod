const express = require('express');
const request = require('supertest');
const { SUPPORTED_PROTOCOL_VERSIONS } = require('@modelcontextprotocol/sdk/types.js');

const context = { getContext: jest.fn() };
const embeds = { list: jest.fn(), get: jest.fn(), preview: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), send: jest.fn() };
const panels = { listPanels: jest.fn(), deletePanel: jest.fn() };
const importEmbedAsset = jest.fn();
const uploadPublicAsset = jest.fn();
const prisma = { user: { findUnique: jest.fn() }, auditLog: { create: jest.fn(), update: jest.fn() } };

jest.mock('../src/config/prisma', () => ({ __esModule: true, default: prisma }));
jest.mock('../src/services/discordContextService', () => ({ __esModule: true, default: context }));
jest.mock('../src/services/discordEmbedService', () => ({ __esModule: true, default: embeds }));
jest.mock('../src/services/reactionRoleService', () => ({ __esModule: true, default: panels }));
jest.mock('../src/services/embedAssetService', () => ({ importEmbedAsset, uploadPublicAsset }));
jest.mock('../src/config/redis', () => ({ getRedisClient: async () => ({ eval: async () => 1 }) }));
jest.mock('../src/services/mcpAuthorizationService', () => ({
  McpOAuthError: class McpOAuthError extends Error {},
  mcpAuthorizationService: { verifyAccessToken: jest.fn() },
}));

const { createMcpTransportRouter } = require('../src/mcp/transport');
const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];
const baseActor = { discordId: '12345678901234567', clientId: 'client-1', role: 'admin', scopes: ['fcm:read', 'fcm:discord:write'], grantId: 'grant-1' };
const headers = { Authorization: 'Bearer token', Accept: 'application/json, text/event-stream', Origin: 'https://claude.ai', 'MCP-Protocol-Version': protocolVersion };
const rpc = (name, args = {}, id = 1) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
function body(response) { const line = response.text.split('\n').find(value => value.startsWith('data: ')); return line ? JSON.parse(line.slice(6)) : response.body; }
function app(actor = baseActor) {
  const value = express();
  value.use('/mcp', createMcpTransportRouter({ authorizationService: { verifyAccessToken: async () => actor }, enabled: () => true, allowedOrigins: () => ['https://claude.ai'], resourceUrl: () => 'https://falloutchatmod.com/mcp', rateLimit: async () => true }));
  return value;
}
async function call(name, args, actor) { return body(await request(app(actor)).post('/mcp').set(headers).send(rpc(name, args))); }

describe('remote MCP Discord tools', () => {
  beforeEach(() => {
    jest.clearAllMocks(); prisma.user.findUnique.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    prisma.auditLog.create.mockResolvedValue({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: new Date('2026-09-14T00:00:00Z') }); prisma.auditLog.update.mockResolvedValue({});
    context.getContext.mockResolvedValue({
      channels: [{ id: '11111111111111111', name: 'general' }], roles: [{ id: '22222222222222222', name: 'Vault Dweller', color: 1 }],
      emojis: [{ id: '33333333333333333', name: 'vaultboy', animated: true, tag: '<a:vaultboy:33333333333333333>', url: 'https://cdn.discordapp.com/e.webp' }],
    });
    embeds.preview.mockReturnValue({ embed: { title: 'Hello' }, warnings: [] });
    embeds.send.mockResolvedValue({ sent: true, messageId: '44444444444444444', reactionRoles: 1 });
  });

  it('publishes stable schemas and all required annotations from one catalog', async () => {
    const response = await request(app()).post('/mcp').set(headers).send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const tools = body(response).result.tools;
    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'fcm_discord_context_get', 'fcm_embeds_list', 'fcm_embeds_get', 'fcm_embeds_create', 'fcm_embeds_update',
      'fcm_embeds_delete', 'fcm_embed_asset_import', 'fcm_embed_preview', 'fcm_embeds_send',
      'fcm_reaction_role_panels_list', 'fcm_reaction_role_panels_delete',
      'fcm_asset_upload',
    ]));
    for (const tool of tools.filter(tool => tool.name.startsWith('fcm_'))) {
      expect(tool).toEqual(expect.objectContaining({ title: expect.any(String), inputSchema: expect.any(Object), outputSchema: expect.any(Object) }));
      expect(tool.annotations).toEqual(expect.objectContaining({ title: expect.any(String), readOnlyHint: expect.any(Boolean), destructiveHint: expect.any(Boolean), idempotentHint: expect.any(Boolean), openWorldHint: expect.any(Boolean) }));
    }
    expect(tools.find(tool => tool.name === 'fcm_embeds_send').inputSchema).toMatchSnapshot();
  });

  it('uploads a base64 file and returns its public object-store URL', async () => {
    uploadPublicAsset.mockResolvedValue({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', publicUrl: 'https://falloutchatmod.com/embed-assets/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/hash.pdf', mimeType: 'application/pdf', byteSize: 12, sha256: 'a'.repeat(64) });
    const response = await call('fcm_asset_upload', { fileBase64: Buffer.from('%PDF-1.7').toString('base64'), mimeType: 'application/pdf', confirm: true });
    expect(response.result.structuredContent).toEqual(expect.objectContaining({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', mimeType: 'application/pdf', byteSize: 12 }));
    expect(uploadPublicAsset).toHaveBeenCalledWith(expect.any(String), 'application/pdf', baseActor.discordId);
  });

  it('derives the catalog version from registered definitions', () => {
    const { deriveCatalogVersion, MCP_CATALOG_VERSION } = require('../src/mcp/server');
    const { z } = require('zod');
    const changed = deriveCatalogVersion([(server) => server.registerTool('fcm_test_catalog_change', {
      title: 'Catalog test', description: 'Test-only definition.', inputSchema: z.object({ value: z.string() }), outputSchema: z.object({ ok: z.boolean() }),
      annotations: { title: 'Catalog test', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async () => ({ content: [{ type: 'text', text: 'ok' }], structuredContent: { ok: true } }))]);
    expect(changed).toMatch(/^sha256:[a-f0-9]{16}$/);
    expect(changed).not.toBe(MCP_CATALOG_VERSION);
  });

  it('enforces read and write scopes and rejects a missing confirmation in schema validation', async () => {
    expect((await call('fcm_discord_context_get', {}, { ...baseActor, scopes: [] })).result.structuredContent.error.code).toBe('insufficient_scope');
    expect((await call('fcm_embeds_delete', { id: 1, confirm: true }, { ...baseActor, scopes: ['fcm:read'] })).result.structuredContent.error.code).toBe('insufficient_scope');
    const refused = await call('fcm_embeds_delete', { id: 1 });
    expect(refused.result.isError).toBe(true);
    expect(embeds.remove).not.toHaveBeenCalled();
  });

  it('resolves current custom emoji metadata and sends only to a live channel with an assignable role', async () => {
    const response = await call('fcm_embeds_send', { channelId: '11111111111111111', embed: { title: 'Hello' }, reactionRoles: [{ customEmojiId: '33333333333333333', roleId: '22222222222222222' }], confirm: true });
    expect(response.result.structuredContent).toEqual({ sent: true, messageId: '44444444444444444', channelId: '11111111111111111', reactionRoles: 1 });
    expect(embeds.send).toHaveBeenCalledWith(expect.objectContaining({ reactionRoles: [{ emoji: 'vaultboy', customEmojiId: '33333333333333333', animated: true, roleId: '22222222222222222' }] }));
    expect(embeds.send).toHaveBeenCalledWith(expect.objectContaining({ suppressAudit: true }));
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'mcp_embed_send', metadata: expect.objectContaining({ outcome: 'attempt', actorDiscordId: baseActor.discordId }) }) }));
    expect(prisma.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'success' }) }) }));
  });

  it.each([
    ['stale emoji', [{ customEmojiId: '99999999999999999', roleId: '22222222222222222' }], 'Custom emoji'],
    ['unassignable role', [{ emoji: '🎮', roleId: '99999999999999999' }], 'not currently assignable'],
  ])('fails closed for %s and audits failure', async (_label, reactionRoles, message) => {
    const response = await call('fcm_embeds_send', { channelId: '11111111111111111', embed: { title: 'Hello' }, reactionRoles, confirm: true });
    expect(response.result.isError).toBe(true); expect(response.result.content[0].text).toContain(message); expect(embeds.send).not.toHaveBeenCalled();
    expect(prisma.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'failure' }) }) }));
  });

  it('rejects an unknown channel before Discord send', async () => {
    const response = await call('fcm_embeds_send', { channelId: '99999999999999999', embed: { title: 'Hello' }, confirm: true });
    expect(response.result.isError).toBe(true); expect(response.result.content[0].text).toContain('Target channel'); expect(embeds.send).not.toHaveBeenCalled();
  });

  it('blocks side effects when the attributable audit intent cannot be created', async () => {
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit database unavailable'));
    const response = await call('fcm_embeds_delete', { id: 1, confirm: true });
    expect(response.result.structuredContent.error.code).toBe('audit_unavailable');
    expect(embeds.remove).not.toHaveBeenCalled();
  });

  it('reports an applied mutation with an audit correlation ID when finalization retries fail', async () => {
    embeds.remove.mockResolvedValue(undefined);
    prisma.auditLog.update.mockRejectedValue(new Error('audit update unavailable'));
    const response = await call('fcm_embeds_delete', { id: 1, confirm: true });
    expect(response.result).toMatchObject({ isError: true, structuredContent: { error: { code: 'mutation_applied_audit_incomplete' } } });
    expect(response.result.content[0].text).toContain('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(response.result.content[0].text).toContain('Do not blindly retry');
    expect(embeds.remove).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.update).toHaveBeenCalledTimes(2);
  });

  it('reports audit-incomplete when a pre-effect failure cannot be finalized', async () => {
    embeds.remove.mockRejectedValueOnce(new Error('database write failed'));
    prisma.auditLog.update.mockRejectedValue(new Error('audit update unavailable'));
    const response = await call('fcm_embeds_delete', { id: 1, confirm: true });
    expect(response.result.structuredContent.error.code).toBe('mutation_applied_audit_incomplete');
    expect(response.result.content[0].text).toContain('may not have been applied');
    expect(embeds.remove).toHaveBeenCalledTimes(1);
  });

  it('supports successful template CRUD and asset import with one audit intent each', async () => {
    const now = new Date('2026-09-14T00:00:00Z');
    embeds.list.mockResolvedValue([{ id: 1, name: 'Welcome', data: { title: 'Hello' }, createdAt: now, updatedAt: now }]);
    embeds.get.mockResolvedValue({ id: 1, name: 'Welcome', data: { title: 'Hello' }, createdAt: now, updatedAt: now });
    embeds.create.mockResolvedValue({ id: 1, name: 'Welcome', data: { title: 'Hello' }, createdAt: now, updatedAt: now });
    embeds.update.mockResolvedValue({ id: 1, name: 'Updated', data: { title: 'Updated' }, createdAt: now, updatedAt: now });
    embeds.remove.mockResolvedValue(undefined);
    importEmbedAsset.mockResolvedValue({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', publicUrl: 'https://falloutchatmod.com/embed-assets/b/x.png', mimeType: 'image/png', byteSize: 42, sha256: 'a'.repeat(64) });
    expect((await call('fcm_embeds_list', {})).result.structuredContent.templates).toHaveLength(1);
    expect((await call('fcm_embeds_get', { id: 1 })).result.structuredContent.template.name).toBe('Welcome');
    expect((await call('fcm_embeds_create', { name: 'Welcome', embed: { title: 'Hello' }, confirm: true })).result.structuredContent.template.id).toBe(1);
    expect((await call('fcm_embeds_update', { id: 1, name: 'Updated', embed: { title: 'Updated' }, confirm: true })).result.structuredContent.template.name).toBe('Updated');
    expect((await call('fcm_embeds_delete', { id: 1, confirm: true })).result.structuredContent.deletedId).toBe(1);
    expect((await call('fcm_embed_asset_import', { sourceUrl: 'https://example.com/image.png', confirm: true })).result.structuredContent.mimeType).toBe('image/png');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(4);
    const finalizedTargets = prisma.auditLog.update.mock.calls.map(([call]) => call.data.metadata.target);
    expect(finalizedTargets).toEqual(expect.arrayContaining([1, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']));
  });

  it('finalizes send audits against the created Discord message ID', async () => {
    await call('fcm_embeds_send', { channelId: '11111111111111111', embed: { title: 'Hello' }, confirm: true });
    expect(prisma.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ metadata: expect.objectContaining({ target: '44444444444444444' }) }),
    }));
  });

  it('lists and deactivates reaction-role panels', async () => {
    panels.listPanels.mockResolvedValue([{ messageId: '44444444444444444', channelId: '11111111111111111', guildId: '55555555555555555', mappings: [{ emoji: '🎮', matchKey: '🎮', reactValue: '🎮', roleId: '22222222222222222' }], createdAt: new Date('2026-09-14T00:00:00Z') }]);
    panels.deletePanel.mockResolvedValue(true);
    expect((await call('fcm_reaction_role_panels_list', {})).result.structuredContent.panels).toHaveLength(1);
    expect((await call('fcm_reaction_role_panels_delete', { messageId: '44444444444444444', confirm: true })).result.structuredContent.deactivatedMessageId).toBe('44444444444444444');
  });

  it('returns a bounded failure when Discord rejects the send', async () => {
    embeds.send.mockRejectedValueOnce(new Error('Discord rejected the message'));
    const response = await call('fcm_embeds_send', { channelId: '11111111111111111', embed: { title: 'Hello' }, confirm: true });
    expect(response.result).toMatchObject({ isError: true, structuredContent: { error: { code: 'operation_failed', message: 'The operation failed in an upstream service' } } });
    expect(JSON.stringify(response.result)).not.toContain('Discord rejected the message');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'failure' }) }) }));
  });

  it('records a failed attempt when panel creation fails after Discord accepted the message', async () => {
    embeds.send.mockRejectedValueOnce(Object.assign(new Error('bounded partial failure'), {
      code: 'embed_sent_panel_failed', messageId: '44444444444444444', channelId: '11111111111111111', causeClass: 'DiscordAPIError',
    }));
    const response = await call('fcm_embeds_send', { channelId: '11111111111111111', embed: { title: 'Hello' }, reactionRoles: [{ emoji: '🎮', roleId: '22222222222222222' }], confirm: true });
    expect(response.result).toMatchObject({ isError: true, structuredContent: { error: { code: 'mutation_partially_applied' } } });
    expect(response.result.content[0].text).toContain('Message ID: 44444444444444444');
    expect(response.result.content[0].text).toContain('Do not retry');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(embeds.send).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'partial', target: '44444444444444444' }) }) }));
  });

  it('preserves partial-send identifiers when both audit finalization attempts fail', async () => {
    embeds.send.mockRejectedValueOnce(Object.assign(new Error('bounded partial failure'), {
      code: 'embed_sent_panel_failed', messageId: '44444444444444444', channelId: '11111111111111111', causeClass: 'DiscordAPIError',
    }));
    prisma.auditLog.update.mockRejectedValue(new Error('audit update unavailable'));
    const response = await call('fcm_embeds_send', { channelId: '11111111111111111', embed: { title: 'Hello' }, reactionRoles: [{ emoji: '🎮', roleId: '22222222222222222' }], confirm: true });
    expect(response.result).toMatchObject({
      isError: true,
      structuredContent: { error: {
        code: 'mutation_applied_audit_incomplete', correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        messageId: '44444444444444444', channelId: '11111111111111111', causeClass: 'DiscordAPIError',
      } },
    });
    expect(response.result.content[0].text).toContain('Do not blindly retry');
    expect(embeds.send).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.update).toHaveBeenCalledTimes(2);
    for (const [call] of prisma.auditLog.update.mock.calls) {
      expect(call.data.metadata).toEqual(expect.objectContaining({ outcome: 'partial', target: '44444444444444444', messageId: '44444444444444444', channelId: '11111111111111111', causeClass: 'DiscordAPIError' }));
    }
  });

  it('wraps read-service failures without leaking upstream details', async () => {
    embeds.list.mockRejectedValueOnce(new Error('postgres://secret@host'));
    const response = await call('fcm_embeds_list', {});
    expect(response.result).toMatchObject({ isError: true, structuredContent: { error: { code: 'service_unavailable' } } });
    expect(JSON.stringify(response.result)).not.toContain('secret@host');
  });
});
