const express = require('express');
const request = require('supertest');
const http = require('http');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { SUPPORTED_PROTOCOL_VERSIONS } = require('@modelcontextprotocol/sdk/types.js');
const mockRedisEval = jest.fn(async () => 1);

jest.mock('../src/config/redis', () => ({ getRedisClient: async () => ({ eval: mockRedisEval }) }));

jest.mock('../src/services/mcpAuthorizationService', () => ({
  McpOAuthError: class McpOAuthError extends Error { constructor(code, message) { super(message); this.code = code; } },
  mcpAuthorizationService: { verifyAccessToken: jest.fn() },
}));

const { checkSharedRateLimit, createMcpTransportRouter } = require('../src/mcp/transport');
const { MCP_CATALOG_VERSION } = require('../src/mcp/server');

const actor = { discordId: '123', clientId: 'client-1', role: 'admin', scopes: ['fcm:read'], grantId: 'grant-1' };
const auth = { verifyAccessToken: jest.fn(async () => actor) };
const headers = { Authorization: 'Bearer valid-token', Accept: 'application/json, text/event-stream', Origin: 'https://claude.ai' };

function makeApp(overrides = {}) {
  const app = express();
  app.use('/mcp', createMcpTransportRouter({
    authorizationService: auth,
    enabled: () => true,
    allowedOrigins: () => ['https://claude.ai'],
    resourceUrl: () => 'https://falloutchatmod.com/mcp',
    rateLimit: async () => true,
    ...overrides,
  }));
  return app;
}

function rpc(method, params, id = 1) {
  return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) };
}

function responseBody(response) {
  if (!response.headers['content-type']?.includes('text/event-stream')) return response.body;
  const data = response.text.split('\n').find(line => line.startsWith('data: '));
  return JSON.parse(data.slice(6));
}

describe('remote Streamable HTTP MCP', () => {
  beforeEach(() => { auth.verifyAccessToken.mockClear(); auth.verifyAccessToken.mockResolvedValue(actor); mockRedisEval.mockClear(); mockRedisEval.mockResolvedValue(1); });

  test('supports Inspector-compatible initialize, tools/list, and tools/call', async () => {
    const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];
    const initialized = await request(makeApp()).post('/mcp').set(headers).send(rpc('initialize', {
      protocolVersion, capabilities: {}, clientInfo: { name: 'test-inspector', version: '1.0.0' },
    }));
    expect(initialized.status).toBe(200);
    expect(responseBody(initialized).result.serverInfo.name).toBe('fcm-admin');
    expect(responseBody(initialized).result.capabilities.tools.listChanged).toBe(false);
    expect(responseBody(initialized).result.instructions).toContain(`Catalog ${MCP_CATALOG_VERSION}`);

    const listed = await request(makeApp()).post('/mcp').set(headers).set('MCP-Protocol-Version', protocolVersion).send(rpc('tools/list', {}));
    expect(listed.status).toBe(200);
    expect(responseBody(listed).result.tools.map(tool => tool.name)).toContain('fcm_context_get');

    const called = await request(makeApp()).post('/mcp').set(headers).set('MCP-Protocol-Version', protocolVersion).send(rpc('tools/call', { name: 'fcm_context_get', arguments: {} }));
    expect(called.status).toBe(200);
    expect(responseBody(called).result.structuredContent).toEqual({ discordId: '123', clientId: 'client-1', role: 'admin', scopes: ['fcm:read'], catalogVersion: MCP_CATALOG_VERSION });
    expect(auth.verifyAccessToken).toHaveBeenCalledWith('valid-token', 'https://falloutchatmod.com/mcp');
  });

  test('returns structured errors for unknown tools and malformed JSON', async () => {
    const unknown = await request(makeApp()).post('/mcp').set(headers).send(rpc('tools/call', { name: 'missing', arguments: {} }));
    expect(unknown.status).toBe(200);
    expect(responseBody(unknown).result).toMatchObject({ isError: true });
    expect(responseBody(unknown).result.content[0].text).toContain('-32602');

    const malformed = await request(makeApp()).post('/mcp').set(headers).set('Content-Type', 'application/json').send('{');
    expect(malformed.status).toBe(400);
    expect(malformed.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32700 }, id: null });
    expect(malformed.headers['content-type']).toMatch(/application\/json/);
  });

  test('enforces kill switch, origin, content type, protocol version, and body size', async () => {
    expect((await request(makeApp({ enabled: () => false })).post('/mcp').set(headers).send(rpc('tools/list', {}))).status).toBe(404);
    expect((await request(makeApp()).post('/mcp').set({ ...headers, Origin: 'https://evil.example' }).send(rpc('tools/list', {}))).status).toBe(403);
    expect((await request(makeApp()).post('/mcp').set(headers).type('text').send('{}')).status).toBe(415);
    expect((await request(makeApp()).post('/mcp').set(headers).set('MCP-Protocol-Version', '1900-01-01').send(rpc('tools/list', {}))).status).toBe(400);
    expect((await request(makeApp()).post('/mcp').set(headers).send(rpc('tools/call', { name: 'fcm_context_get', arguments: { padding: 'x'.repeat(14 * 1024 * 1024) } }))).status).toBe(413);
  });

  test('returns JSON 405 responses for unsupported stateless GET and DELETE', async () => {
    for (const method of ['get', 'delete']) {
      const response = await request(makeApp())[method]('/mcp');
      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe('POST');
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32600 }, id: null });
    }
  });

  test('returns RFC 6750 challenges and never authenticates after an early rejection', async () => {
    const missing = await request(makeApp()).post('/mcp').set('Accept', headers.Accept).set('Origin', headers.Origin).send(rpc('tools/list', {}));
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toContain('Bearer resource_metadata="https://falloutchatmod.com/.well-known/oauth-protected-resource/mcp"');
    expect(missing.body.error.code).toBe(-32000);
    expect(missing.headers['www-authenticate']).toContain('error="invalid_request"');

    auth.verifyAccessToken.mockRejectedValueOnce(new Error('database details must not leak'));
    const invalid = await request(makeApp()).post('/mcp').set(headers).send(rpc('tools/list', {}));
    expect(invalid.status).toBe(401);
    expect(invalid.headers['www-authenticate']).toContain('error="invalid_token"');
    expect(invalid.text).not.toContain('database details');

    const { McpOAuthError } = require('../src/services/mcpAuthorizationService');
    auth.verifyAccessToken.mockRejectedValueOnce(new McpOAuthError('invalid_scope', 'hidden'));
    const insufficient = await request(makeApp()).post('/mcp').set(headers).send(rpc('tools/list', {}));
    expect(insufficient.status).toBe(403);
    expect(insufficient.headers['www-authenticate']).toContain('error="insufficient_scope"');
    expect(insufficient.headers['www-authenticate']).not.toContain('scope=');
  });

  test('rate limits by verified grant and health remains separate', async () => {
    let count = 0;
    const app = makeApp({ rateMax: 1, rateLimit: async (_grantId, maximum) => ++count <= maximum });
    expect((await request(app).get('/mcp/health')).body).toEqual({ status: 'ok' });
    expect((await request(app).post('/mcp').set(headers).send(rpc('tools/list', {}))).status).toBe(200);
    const limited = await request(app).post('/mcp').set(headers).send(rpc('tools/list', {}, 2));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe(-32003);
    expect((await request(makeApp({ enabled: () => false })).get('/mcp/health')).status).toBe(503);
  });

  test('propagates a valid correlation ID and replaces an invalid one', async () => {
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    expect((await request(makeApp()).post('/mcp').set(headers).set('X-Correlation-ID', id).send(rpc('tools/list', {}))).headers['x-correlation-id']).toBe(id);
    expect((await request(makeApp()).post('/mcp').set(headers).set('X-Correlation-ID', 'secret?token=x').send(rpc('tools/list', {}))).headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('shared limiter uses an atomic expiring Redis counter and conceals grant IDs', async () => {
    expect(await checkSharedRateLimit('sensitive-grant-id', 2)).toBe(true);
    const [script, options] = mockRedisEval.mock.calls[0];
    expect(script).toContain("redis.call('INCR'");
    expect(script).toContain("redis.call('EXPIRE'");
    expect(options.arguments).toEqual(['60']);
    expect(options.keys[0]).not.toContain('sensitive-grant-id');
    mockRedisEval.mockResolvedValueOnce(3);
    expect(await checkSharedRateLimit('sensitive-grant-id', 2)).toBe(false);
    mockRedisEval.mockRejectedValueOnce(new Error('redis unavailable'));
    expect(await checkSharedRateLimit('sensitive-grant-id', 2)).toBe(false);
  });

  test('aborting the HTTP request aborts the tool extra.signal', async () => {
    let markStarted;
    let markAborted;
    const started = new Promise(resolve => { markStarted = resolve; });
    const aborted = new Promise(resolve => { markAborted = resolve; });
    const app = makeApp({ serverFactory: () => {
      const server = new McpServer({ name: 'abort-test', version: '1.0.0' });
      server.registerTool('wait', { description: 'Wait until cancelled', inputSchema: {} }, async (_args, extra) => {
        markStarted();
        await new Promise(resolve => {
          if (extra.signal.aborted) { markAborted(); resolve(); return; }
          extra.signal.addEventListener('abort', () => { markAborted(); resolve(); }, { once: true });
        });
        return { content: [{ type: 'text', text: 'cancelled' }] };
      });
      return server;
    } });
    const listener = app.listen(0);
    await new Promise(resolve => listener.once('listening', resolve));
    const body = JSON.stringify(rpc('tools/call', { name: 'wait', arguments: {} }));
    const client = http.request({ host: '127.0.0.1', port: listener.address().port, path: '/mcp', method: 'POST', headers: {
      ...headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
    } });
    client.on('error', () => undefined);
    client.end(body);
    await started;
    client.destroy();
    await expect(Promise.race([aborted, new Promise((_, reject) => setTimeout(() => reject(new Error('abort timeout')), 1_000))])).resolves.toBeUndefined();
    await new Promise(resolve => listener.close(resolve));
  });
});
