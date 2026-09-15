import test from 'node:test';
import assert from 'node:assert/strict';
import { createHelperAuthenticatedFetch, createStdioProxyServer, runTokenHelper, type RemoteToolClient } from '../prod/remoteBridge.js';

function handlers(server: unknown): Map<string, (request: unknown) => Promise<unknown>> {
  return (server as { _requestHandlers: Map<string, (request: unknown) => Promise<unknown>> })._requestHandlers;
}

test('production bridge discovers the remote tool list dynamically', async () => {
  let generation = 0;
  const remote: RemoteToolClient = { async listTools() { generation += 1; return { tools: [{ name: `remote_tool_${generation}`, inputSchema: { type: 'object' } }] }; }, async callTool() { return { content: [] }; }, async close() {} };
  const list = handlers(createStdioProxyServer(remote)).get('tools/list')!;
  assert.equal(((await list({ method: 'tools/list', params: {} })) as { tools: Array<{ name: string }> }).tools[0]?.name, 'remote_tool_1');
  assert.equal(((await list({ method: 'tools/list', params: {} })) as { tools: Array<{ name: string }> }).tools[0]?.name, 'remote_tool_2');
});

test('production bridge forwards tool calls and preserves the remote result', async () => {
  const calls: unknown[] = [];
  const remote: RemoteToolClient = { async listTools() { return { tools: [] }; }, async callTool(params) { calls.push(params); return { content: [{ type: 'text', text: 'remote' }], structuredContent: { ok: true } }; }, async close() {} };
  const call = handlers(createStdioProxyServer(remote)).get('tools/call')!;
  const result = await call({ method: 'tools/call', params: { name: 'new_remote_tool', arguments: { value: 7 } } });
  assert.deepEqual(calls, [{ name: 'new_remote_tool', arguments: { value: 7 } }]);
  assert.deepEqual(result, { content: [{ type: 'text', text: 'remote' }], structuredContent: { ok: true } });
});

test('credential helper is re-read once after a 401 without exposing tokens', async () => {
  const headers: string[] = [];
  let calls = 0;
  const baseFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    headers.push(new Headers(init?.headers).get('authorization') ?? '');
    calls += 1;
    return new Response('', { status: calls === 1 ? 401 : 200 });
  }) as typeof fetch;
  let tokens = 0;
  const authenticated = createHelperAuthenticatedFetch(baseFetch, async () => ({ accessToken: `secret-token-value-${++tokens}` }));
  assert.equal((await authenticated('https://example.invalid/mcp')).status, 200);
  assert.deepEqual(headers, ['Bearer secret-token-value-1', 'Bearer secret-token-value-2']);
  assert.equal(tokens, 2);
});

test('credential helper kills a hung process within its bounded timeout', async () => {
  await assert.rejects(
    runTokenHelper([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 25, stdoutBytes: 1024, stderrBytes: 1024 }),
    /timed out/,
  );
});

test('credential helper rejects verbose and malformed output without reflecting secrets', async () => {
  const secret = 'do-not-reflect-this-secret';
  await assert.rejects(
    runTokenHelper([process.execPath, '-e', `process.stdout.write('${secret}'.repeat(100))`], { timeoutMs: 1000, stdoutBytes: 32, stderrBytes: 32 }),
    error => error instanceof Error && /size limit/.test(error.message) && !error.message.includes(secret),
  );
  await assert.rejects(
    runTokenHelper([process.execPath, '-e', `process.stdout.write('${secret}')`], { timeoutMs: 1000, stdoutBytes: 1024, stderrBytes: 32 }),
    error => error instanceof Error && /invalid JSON credentials/.test(error.message) && !error.message.includes(secret),
  );
});
