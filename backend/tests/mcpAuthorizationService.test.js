'use strict';
const crypto = require('crypto');
jest.mock('../src/config/prisma', () => require('./setup/prisma-stub'));

const { McpAuthorizationService, McpOAuthError, pkceS256 } = require('../src/services/mcpAuthorizationService');
const { getMcpOperationalSnapshot, resetMcpOperationalStateForTests } = require('../src/services/mcpAuditService');
const prisma = require('./setup/prisma-stub').default;
const client = { clientId: 'client-a', redirectUris: ['https://client.example/callback'], disabledAt: null };
const now = new Date('2026-09-14T12:00:00Z');
const verifier = crypto.randomBytes(32).toString('base64url');

function service(role = 'admin') {
  return new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue({ authorized: true, role }) },
    now: () => now, enabled: () => true, accessTtlSeconds: 600, refreshTtlSeconds: 3600 });
}

describe('mcpAuthorizationService', () => {
  beforeEach(() => { jest.clearAllMocks(); resetMcpOperationalStateForTests(); prisma.mcpOAuthClient.findUnique.mockResolvedValue(client); });

  it('stores only an authorization-code hash and rejects PKCE downgrade', async () => {
    const svc = service();
    const issued = await svc.issueAuthorizationCode({ clientId: client.clientId, discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256', scopes: ['fcm:read'] });
    const stored = prisma.mcpOAuthCode.create.mock.calls[0][0].data;
    expect(stored.codeHash).toBe(crypto.createHash('sha256').update(issued.code).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(issued.code);
    await expect(svc.issueAuthorizationCode({ clientId: client.clientId, discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', pkceChallenge: '', codeChallengeMethod: 'plain', scopes: ['fcm:read'] })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('returns one deterministically bound code for repeated consent approval', async () => {
    prisma.mcpOAuthCode.upsert.mockImplementation(async ({ create }) => ({ ...create }));
    const input = { clientId: client.clientId, discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256',
      scopes: ['fcm:read'], consentIdempotencyKey: 'a'.repeat(43) };
    const first = await service().issueAuthorizationCode(input);
    const second = await service().issueAuthorizationCode(input);
    expect(second.code).toBe(first.code);
    expect(prisma.mcpOAuthCode.upsert).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(prisma.mcpOAuthCode.upsert.mock.calls)).not.toContain(first.code);
  });

  it.each(['replayed', 'expired', 'wrong PKCE', 'wrong audience', 'cross-client'])(
    'rejects a %s authorization code atomically', async () => {
      prisma.mcpOAuthCode.findUnique.mockResolvedValue({ clientId: 'client-a', discordId: '42',
        resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
      prisma.mcpOAuthCode.updateMany.mockResolvedValue({ count: 0 });
      await expect(service().exchangeAuthorizationCode({ code: 'secret', clientId: 'client-a', redirectUri: client.redirectUris[0],
        resource: 'https://falloutchatmod.com/mcp', codeVerifier: verifier })).rejects.toBeInstanceOf(McpOAuthError);
      expect(prisma.mcpOAuthCode.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ consumedAt: null, expiresAt: { gt: now }, clientId: 'client-a',
          redirectUri: client.redirectUris[0], resource: 'https://falloutchatmod.com/mcp', pkceChallenge: pkceS256(verifier) }),
      }));
    });

  it('issues hashed opaque tokens after a one-time code exchange', async () => {
    prisma.mcpOAuthCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.mcpOAuthCode.findUnique.mockResolvedValue({ clientId: 'client-a', discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
    const tokens = await service().exchangeAuthorizationCode({ code: 'code', clientId: 'client-a', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', codeVerifier: verifier });
    const stored = prisma.mcpOAuthGrant.create.mock.calls[0][0].data;
    expect(stored.accessTokenHash).not.toBe(tokens.accessToken);
    expect(stored.refreshTokenHash).not.toBe(tokens.refreshToken);
    expect(JSON.stringify(stored)).not.toContain(tokens.accessToken);
    expect(JSON.stringify(stored)).not.toContain(tokens.refreshToken);
  });

  it('clamps configured access and refresh lifetimes to safe bounds', async () => {
    prisma.mcpOAuthCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.mcpOAuthCode.findUnique.mockResolvedValue({ clientId: 'client-a', discordId: '42',
      resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
    const svc = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue({ authorized: true, role: 'admin' }) },
      now: () => now, enabled: () => true, accessTtlSeconds: 99999, refreshTtlSeconds: 1 });
    const result = await svc.exchangeAuthorizationCode({ code: 'code', clientId: 'client-a', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', codeVerifier: verifier });
    const stored = prisma.mcpOAuthGrant.create.mock.calls[0][0].data;
    expect(result.expiresIn).toBe(900);
    expect(stored.accessTokenExpiresAt.getTime() - now.getTime()).toBe(900000);
    expect(stored.refreshTokenExpiresAt.getTime() - now.getTime()).toBe(86400000);
  });

  it('defaults grants to a 72-hour absolute refresh lifetime', async () => {
    prisma.mcpOAuthCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.mcpOAuthCode.findUnique.mockResolvedValue({ clientId: 'client-a', discordId: '42',
      resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
    const svc = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue({ authorized: true, role: 'admin' }) },
      now: () => now, enabled: () => true });
    await svc.exchangeAuthorizationCode({ code: 'code', clientId: 'client-a', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', codeVerifier: verifier });
    const stored = prisma.mcpOAuthGrant.create.mock.calls[0][0].data;
    expect(stored.refreshTokenExpiresAt.getTime() - now.getTime()).toBe(72 * 60 * 60 * 1000);
  });

  it('caps an oversized refresh lifetime at 72 hours', async () => {
    prisma.mcpOAuthCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.mcpOAuthCode.findUnique.mockResolvedValue({ clientId: 'client-a', discordId: '42',
      resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
    const svc = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue({ authorized: true, role: 'admin' }) },
      now: () => now, enabled: () => true, refreshTtlSeconds: 9999999 });
    await svc.exchangeAuthorizationCode({ code: 'code', clientId: 'client-a', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', codeVerifier: verifier });
    const stored = prisma.mcpOAuthGrant.create.mock.calls[0][0].data;
    expect(stored.refreshTokenExpiresAt.getTime() - now.getTime()).toBe(72 * 60 * 60 * 1000);
  });

  it('binds authorization codes to the exact redirect URI', async () => {
    prisma.mcpOAuthClient.findUnique.mockResolvedValue(client);
    await expect(service().issueAuthorizationCode({ clientId: 'client-a', discordId: '42',
      redirectUri: 'https://evil.example/callback', resource: 'https://falloutchatmod.com/mcp',
      pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256', scopes: ['fcm:read'] }))
      .rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('accepts an ephemeral port for a portless registered HTTP loopback callback', async () => {
    prisma.mcpOAuthClient.findUnique.mockResolvedValue({ ...client, redirectUris: ['http://127.0.0.1/callback/CkPYkR2KjUtX'] });
    await expect(service().issueAuthorizationCode({ clientId: client.clientId, discordId: '42',
      redirectUri: 'http://127.0.0.1:40301/callback/CkPYkR2KjUtX', resource: 'https://falloutchatmod.com/mcp',
      pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256', scopes: ['fcm:read'] })).resolves.toMatchObject({ code: expect.any(String) });
  });

  it('rejects non-S256 challenge methods and malformed verifiers', async () => {
    await expect(service().issueAuthorizationCode({ clientId: 'client-a', discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'plain', scopes: ['fcm:read'] }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    await expect(service().exchangeAuthorizationCode({ code: 'x', clientId: 'client-a', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', codeVerifier: 'short' })).rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('rejects any audience other than the configured MCP resource', async () => {
    await expect(service().issueAuthorizationCode({ clientId: 'client-a', discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://attacker.example/mcp', pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256', scopes: ['fcm:read'] }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
  });

  it('rolls code consumption back when grant persistence fails', async () => {
    prisma.mcpOAuthCode.findUnique.mockResolvedValue({ clientId: 'client-a', discordId: '42', resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
    prisma.mcpOAuthCode.updateMany.mockResolvedValue({ count: 1 });
    prisma.mcpOAuthGrant.create.mockRejectedValue(new Error('write failed'));
    await expect(service().exchangeAuthorizationCode({ code: 'code', clientId: 'client-a', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', codeVerifier: verifier })).rejects.toThrow('write failed');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('revokes a refresh family when an already-rotated token is reused', async () => {
    const old = 'fcm_rt_old'; const oldHash = crypto.createHash('sha256').update(old).digest('hex');
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: [oldHash],
      refreshTokenHash: 'new', refreshTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    await expect(service().refresh({ refreshToken: old, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { familyId: 'family', revokedAt: null } }));
    expect(getMcpOperationalSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({ metric: 'refresh', labels: { outcome: 'reuse' }, count: 1 }),
      expect.objectContaining({ metric: 'refresh', labels: { outcome: 'failure' }, count: 1 }),
    ]));
  });

  it('rejects audience confusion and cross-client refreshes', async () => {
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ clientId: 'other', audience: 'https://other/mcp' });
    await expect(service().refresh({ refreshToken: 'x', clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    expect(getMcpOperationalSnapshot()).toContainEqual(expect.objectContaining({ metric: 'refresh', labels: { outcome: 'failure' }, count: 1 }));
  });

  it('successfully rotates a refresh token with bounded lifetimes', async () => {
    const raw = 'fcm_rt_current'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: [], refreshTokenHash: currentHash,
      refreshTokenExpiresAt: new Date(now.getTime() + 1000000), revokedAt: null });
    prisma.mcpOAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    const result = await service().refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' });
    expect(result.refreshToken).not.toBe(raw);
    expect(result.expiresIn).toBe(600);
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ usedRefreshTokenHashes: [currentHash] }) }));
    const rotation = prisma.mcpOAuthGrant.updateMany.mock.calls[0][0].data;
    expect(rotation).not.toHaveProperty('refreshTokenExpiresAt');
  });

  it('repeated refresh rotations never extend the original family expiry', async () => {
    const absoluteExpiry = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const first = 'fcm_rt_first'; const second = 'fcm_rt_second';
    const grant = (raw, used = []) => ({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: used,
      refreshTokenHash: crypto.createHash('sha256').update(raw).digest('hex'), refreshTokenExpiresAt: absoluteExpiry, revokedAt: null });
    prisma.mcpOAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    prisma.mcpOAuthGrant.findFirst.mockResolvedValueOnce(grant(first)).mockResolvedValueOnce(grant(second, ['prior']));
    await service().refresh({ refreshToken: first, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' });
    await service().refresh({ refreshToken: second, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' });
    for (const call of prisma.mcpOAuthGrant.updateMany.mock.calls) {
      expect(call[0].data).not.toHaveProperty('refreshTokenExpiresAt');
    }
  });

  it('clamps a near-expiry refresh access token to the family boundary', async () => {
    const raw = 'fcm_rt_near_expiry'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    const familyExpiry = new Date(now.getTime() + 2500);
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: [], refreshTokenHash: currentHash,
      refreshTokenExpiresAt: familyExpiry, revokedAt: null });
    prisma.mcpOAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    const result = await service().refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' });
    const update = prisma.mcpOAuthGrant.updateMany.mock.calls[0][0].data;
    expect(update.accessTokenExpiresAt).toEqual(familyExpiry);
    expect(result.expiresIn).toBe(3);
    expect(result.expiresIn).toBeGreaterThan(0);
  });

  it('rejects and revokes access after the absolute family expiry even if access expiry is later', async () => {
    prisma.mcpOAuthGrant.findUnique.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], accessTokenExpiresAt: new Date(now.getTime() + 600000),
      refreshTokenExpiresAt: new Date(now.getTime() - 1), revokedAt: null });
    await expect(service().verifyAccessToken('access', 'https://falloutchatmod.com/mcp')).rejects.toMatchObject({ code: 'invalid_token' });
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith({ where: { familyId: 'family', revokedAt: null }, data: { revokedAt: now } });
  });

  it('revokes an admin grant after an admin-to-developer role downgrade', async () => {
    const raw = 'fcm_rt_admin'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read', 'fcm:moderation:write'], usedRefreshTokenHashes: [],
      refreshTokenHash: currentHash, refreshTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    await expect(service('developer').refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp',
      scopes: ['fcm:read'] })).rejects.toMatchObject({ code: 'invalid_grant', message: 'Refresh token is invalid' });
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith({ where: { familyId: 'family', revokedAt: null }, data: { revokedAt: now } });
  });

  it('allows legitimate requested-scope narrowing during refresh', async () => {
    const raw = 'fcm_rt_admin'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read', 'fcm:discord:write'], usedRefreshTokenHashes: [],
      refreshTokenHash: currentHash, refreshTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    prisma.mcpOAuthGrant.updateMany.mockResolvedValue({ count: 1 });
    const result = await service().refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'] });
    expect(result.scopes).toEqual(['fcm:read']);
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ scopes: ['fcm:read'] }) }));
  });

  it.each([
    ['unsupported', ['fcm:unknown']],
    ['increased', ['fcm:read', 'fcm:moderation:write']],
  ])('rejects a caller-requested %s scope set without revoking a valid family', async (_label, scopes) => {
    const raw = 'fcm_rt_developer'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: [],
      refreshTokenHash: currentHash, refreshTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    await expect(service('developer').refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp', scopes }))
      .rejects.toMatchObject({ code: 'invalid_scope' });
    expect(prisma.mcpOAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it('revokes the family on a concurrent refresh race', async () => {
    const raw = 'fcm_rt_current'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: [], refreshTokenHash: currentHash,
      refreshTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    prisma.mcpOAuthGrant.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(service().refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { familyId: 'family', revokedAt: null } }));
  });

  it('rejects expired refresh and access tokens', async () => {
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ clientId: 'client-a', audience: 'https://falloutchatmod.com/mcp', usedRefreshTokenHashes: [],
      refreshTokenExpiresAt: new Date(now.getTime() - 1), revokedAt: null });
    await expect(service().refresh({ refreshToken: 'expired', clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' }))
      .rejects.toMatchObject({ code: 'invalid_grant' });
    prisma.mcpOAuthGrant.findUnique.mockResolvedValue({ accessTokenExpiresAt: new Date(now.getTime() - 1), revokedAt: null,
      audience: 'https://falloutchatmod.com/mcp' });
    await expect(service().verifyAccessToken('expired', 'https://falloutchatmod.com/mcp')).rejects.toMatchObject({ code: 'invalid_token' });
  });

  it('denies disabled clients', async () => {
    prisma.mcpOAuthClient.findUnique.mockResolvedValue({ ...client, disabledAt: now });
    await expect(service().issueAuthorizationCode({ clientId: 'client-a', discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256', scopes: ['fcm:read'] }))
      .rejects.toMatchObject({ code: 'invalid_client' });
  });

  it('prevents developer privilege escalation into moderation scope', async () => {
    await expect(service('developer').issueAuthorizationCode({ clientId: 'client-a', discordId: '42', redirectUri: client.redirectUris[0],
      resource: 'https://falloutchatmod.com/mcp', pkceChallenge: pkceS256(verifier), codeChallengeMethod: 'S256', scopes: ['fcm:moderation:write'] }))
      .rejects.toMatchObject({ code: 'invalid_scope' });
  });

  it('revokes the family after privilege loss on protected access', async () => {
    const denied = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue({ authorized: false, reason: 'role_missing' }) },
      now: () => now, enabled: () => true });
    prisma.mcpOAuthGrant.findUnique.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], accessTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    await expect(denied.verifyAccessToken('token', 'https://falloutchatmod.com/mcp', ['fcm:read']))
      .rejects.toMatchObject({ code: 'invalid_token', message: 'Access token is invalid' });
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { familyId: 'family', revokedAt: null } }));
  });

  it.each([
    { label: 'role loss', denial: { authorized: false, reason: 'role_missing' } },
    { label: 'ban', denial: { authorized: false, reason: 'banned' } },
  ])('revokes the refresh family on $label without disclosing the cause', async ({ denial }) => {
    const raw = 'fcm_rt_current'; const currentHash = crypto.createHash('sha256').update(raw).digest('hex');
    const svc = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue(denial) },
      now: () => now, enabled: () => true });
    prisma.mcpOAuthGrant.findFirst.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], usedRefreshTokenHashes: ['older-hash'],
      refreshTokenHash: currentHash, refreshTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    await expect(svc.refresh({ refreshToken: raw, clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' }))
      .rejects.toMatchObject({ code: 'invalid_grant', message: 'Refresh token is invalid' });
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith({ where: { familyId: 'family', revokedAt: null }, data: { revokedAt: now } });
  });

  it.each(['access', 'refresh'])('revokes the family when its client is disabled during %s validation', async (kind) => {
    prisma.mcpOAuthClient.findUnique.mockResolvedValue({ disabledAt: now });
    const grant = { id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42', audience: 'https://falloutchatmod.com/mcp',
      scopes: ['fcm:read'], usedRefreshTokenHashes: [], refreshTokenHash: crypto.createHash('sha256').update('refresh').digest('hex'),
      refreshTokenExpiresAt: new Date(now.getTime() + 10000), accessTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null };
    if (kind === 'access') {
      prisma.mcpOAuthGrant.findUnique.mockResolvedValue(grant);
      await expect(service().verifyAccessToken('access', 'https://falloutchatmod.com/mcp')).rejects.toMatchObject({ code: 'invalid_token' });
    } else {
      prisma.mcpOAuthGrant.findFirst.mockResolvedValue(grant);
      await expect(service().refresh({ refreshToken: 'refresh', clientId: 'client-a', resource: 'https://falloutchatmod.com/mcp' }))
        .rejects.toMatchObject({ code: 'invalid_grant' });
    }
    expect(prisma.mcpOAuthGrant.updateMany).toHaveBeenCalledWith({ where: { familyId: 'family', revokedAt: null }, data: { revokedAt: now } });
  });

  it('does not resurrect a revoked grant after its client is re-enabled', async () => {
    prisma.mcpOAuthClient.findUnique.mockResolvedValue(client);
    prisma.mcpOAuthGrant.findUnique.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], accessTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: now });
    await expect(service().verifyAccessToken('access', 'https://falloutchatmod.com/mcp')).rejects.toMatchObject({ code: 'invalid_token' });
    expect(prisma.mcpOAuthClient.findUnique).not.toHaveBeenCalled();
  });

  it('keeps missing tokens non-enumerating and performs no family mutation', async () => {
    prisma.mcpOAuthGrant.findUnique.mockResolvedValue(null);
    await expect(service().verifyAccessToken('unknown', 'https://falloutchatmod.com/mcp')).rejects.toMatchObject({ code: 'invalid_token', message: 'Access token is invalid' });
    expect(prisma.mcpOAuthGrant.updateMany).not.toHaveBeenCalled();
  });

  it('preserves a generic denial if best-effort family revocation fails', async () => {
    const denied = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn().mockResolvedValue({ authorized: false, reason: 'banned' }) },
      now: () => now, enabled: () => true });
    prisma.mcpOAuthGrant.findUnique.mockResolvedValue({ id: 'g', familyId: 'family', clientId: 'client-a', discordId: '42',
      audience: 'https://falloutchatmod.com/mcp', scopes: ['fcm:read'], accessTokenExpiresAt: new Date(now.getTime() + 10000), revokedAt: null });
    prisma.mcpOAuthGrant.updateMany.mockRejectedValue(new Error('database unavailable'));
    await expect(denied.verifyAccessToken('access', 'https://falloutchatmod.com/mcp')).rejects.toMatchObject({
      code: 'invalid_token', message: 'Access token is invalid',
    });
  });

  it('fails closed when the global kill switch is off', async () => {
    const svc = new McpAuthorizationService({ prisma, roleService: { authorize: jest.fn() }, enabled: () => false });
    await expect(svc.verifyAccessToken('x', 'aud')).rejects.toMatchObject({ code: 'access_denied' });
  });
});
