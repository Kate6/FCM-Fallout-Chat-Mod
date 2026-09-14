'use strict';
jest.mock('../src/config/prisma', () => require('./setup/prisma-stub'));
jest.mock('../src/config/logger', () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const prisma = require('./setup/prisma-stub').default;
const logger = require('../src/config/logger').default;
const auditService = require('../src/services/mcpAuditService');

describe('MCP audit and operational telemetry', () => {
  const actor = { discordId: '123', clientId: 'client-a', role: 'admin', scopes: ['fcm:discord:write'], grantId: 'grant-secret', correlationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
  beforeEach(() => { jest.clearAllMocks(); auditService.resetMcpOperationalStateForTests(); prisma.user.findUnique.mockResolvedValue({ id: 'user-id' }); prisma.auditLog.create.mockResolvedValue({ id: actor.correlationId, createdAt: new Date('2026-09-14T00:00:00Z') }); prisma.auditLog.update.mockResolvedValue({}); });

  it('redacts credentials, content, and URL credentials/query/fragment', () => {
    const value = auditService.redactMcpData({ Authorization: 'Bearer abc', authCode: 'code', refreshToken: 'token', imageBytes: Buffer.from('secret'), sourceUrl: 'https://user:pass@example.com/image.png?signature=secret#x', safe: 'ok', long: 'x'.repeat(600) });
    expect(JSON.stringify(value)).not.toMatch(/Bearer abc|signature|user:pass|secret/);
    expect(value).toMatchObject({ Authorization: '[redacted]', authCode: '[redacted]', refreshToken: '[redacted]', imageBytes: '[redacted]', safe: 'ok', sourceUrl: 'https://example.com/image.png' });
    expect(value.long.length).toBeLessThan(520);
  });

  it('persists attempt and partial outcome with correlation and latency', async () => {
    const audit = await auditService.beginMcpMutationAudit(actor, 'embeds_send', 'discord_message', 'channel-1', { sourceUrl: 'https://x.test/a?token=x' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ id: actor.correlationId, metadata: expect.objectContaining({ correlationId: actor.correlationId, actorDiscordId: '123', clientId: 'client-a', grant: expect.stringMatching(/^[a-f0-9]{16}$/), tool: 'embeds_send', outcome: 'attempt', target: 'channel-1', sourceUrl: 'https://x.test/a' }) }) }));
    expect(JSON.stringify(prisma.auditLog.create.mock.calls[0][0])).not.toContain('grant-secret');
    await expect(auditService.finalizeMcpMutationAudit(audit, actor, 'embeds_send', 'message-1', 'partial', { causeClass: 'reaction' })).resolves.toBe(true);
    expect(prisma.auditLog.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'partial', target: 'message-1', correlationId: actor.correlationId, latencyMs: expect.any(Number) }) }) }));
  });

  it('retries finalization without losing the durable intent', async () => {
    prisma.auditLog.update.mockRejectedValue(new Error('down'));
    const audit = await auditService.beginMcpMutationAudit(actor, 'embeds_send', 'discord_message', null);
    await expect(auditService.finalizeMcpMutationAudit(audit, actor, 'embeds_send', null, 'failure')).resolves.toBe(false);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1); expect(prisma.auditLog.update).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ correlationId: actor.correlationId }), expect.any(String));
  });

  it('uses bounded metric labels and thresholded alerts', () => {
    auditService.recordMcpMetric('tool_call', { tool: 'INVALID TOOL/client-id', outcome: 'made-up', actorId: 'high-cardinality' }, 12);
    expect(auditService.getMcpOperationalSnapshot()).toEqual([expect.objectContaining({ metric: 'tool_call', labels: { outcome: 'unknown', tool: 'unknown' }, count: 1, totalMs: 12 })]);
    auditService.noteMcpSecurityEvent('ssrf_rejection'); auditService.noteMcpSecurityEvent('ssrf_rejection');
    expect(logger.warn.mock.calls.filter(([data]) => data.event === 'mcp_operational_alert')).toHaveLength(0);
    auditService.noteMcpSecurityEvent('ssrf_rejection');
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'mcp_operational_alert', kind: 'ssrf_rejection', count: 3 }), expect.any(String));
    expect(logger.warn.mock.calls.filter(([data]) => data.event === 'mcp_security_event')).toHaveLength(3);
  });

  it('logs denials with correlation and a pseudonymous grant', () => {
    auditService.auditMcpDenial({ correlationId: actor.correlationId, reason: 'rate_limit', tool: 'fcm_embeds_send', target: '123', actorDiscordId: actor.discordId, clientId: actor.clientId, grantId: actor.grantId });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'mcp_denial', correlationId: actor.correlationId, reason: 'rate_limit', actorDiscordId: actor.discordId, clientId: actor.clientId, grant: expect.stringMatching(/^[a-f0-9]{16}$/) }), 'MCP request denied');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(actor.grantId);
  });

  it('replaces untrusted secret-bearing denial targets with unknown', () => {
    auditService.auditMcpDenial({ correlationId: actor.correlationId, reason: 'confirmation_required', tool: 'fcm_embeds_delete', target: 'fcm_at_secret-token-value' });
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ target: 'unknown', tool: 'embeds_delete' }), 'MCP request denied');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-token-value');
  });

  it.each([
    ['banned', 'banned'], ['role_missing', 'missing_role'], ['verification_unavailable', 'verification_unavailable'], ['attacker-value', 'unknown'],
  ])('maps role result %s to bounded metric reason %s', (input, expected) => {
    const reason = auditService.classifyMcpRoleDenial(input);
    auditService.recordMcpMetric('role_denial', { reason });
    expect(auditService.getMcpOperationalSnapshot()).toContainEqual(expect.objectContaining({ metric: 'role_denial', labels: { reason: expected }, count: 1 }));
  });

  it('never serializes secrets through representative auth denial and tool audit paths', async () => {
    const secrets = ['Bearer super-secret', 'auth-code-value', 'refresh-token-value', 'client-secret-value', 'url-user', 'url-pass', 'signed-query', 'fragment-secret', 'raw-image-content'];
    auditService.auditMcpDenial({ correlationId: actor.correlationId, reason: 'Bearer super-secret', tool: 'attacker/tool?refresh-token-value',
      target: 'https://url-user:url-pass@example.test/image.png?signed-query=yes#fragment-secret', grantId: actor.grantId });
    const audit = await auditService.beginMcpMutationAudit(actor, 'embed_asset_import', 'embed_asset', null, {
      Authorization: 'Bearer super-secret', code: 'auth-code-value', refreshToken: 'refresh-token-value', clientSecret: 'client-secret-value',
      sourceUrl: 'https://url-user:url-pass@example.test/image.png?signed-query=yes#fragment-secret', imageBytes: Buffer.from('raw-image-content'), content: 'raw-image-content',
    });
    await auditService.finalizeMcpMutationAudit(audit, actor, 'embed_asset_import', null, 'failure');
    const serialized = JSON.stringify({ logs: logger.warn.mock.calls.concat(logger.info.mock.calls, logger.error.mock.calls), audits: prisma.auditLog.create.mock.calls.concat(prisma.auditLog.update.mock.calls) });
    for (const secret of secrets) expect(serialized).not.toContain(secret);
  });
});
