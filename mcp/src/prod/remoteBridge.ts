import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_REMOTE_URL = 'https://falloutchatmod.com/mcp';
export interface RemoteToolClient {
  listTools(params?: { cursor?: string }): Promise<{ tools: Tool[]; nextCursor?: string }>;
  callTool(params: { name: string; arguments?: Record<string, unknown> }): ReturnType<Client['callTool']>;
  close(): Promise<void>;
}
export interface HelperToken { accessToken: string; expiresAt?: number }
export interface TokenHelperLimits { timeoutMs: number; stdoutBytes: number; stderrBytes: number }
const DEFAULT_HELPER_LIMITS: TokenHelperLimits = { timeoutMs: 15_000, stdoutBytes: 64 * 1024, stderrBytes: 8 * 1024 };

function helperArgv(): readonly string[] {
  const raw = process.env['FCM_MCP_OAUTH_HELPER'];
  if (!raw) throw new Error('FCM_MCP_OAUTH_HELPER is required; configure a secure OAuth token helper command');
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('FCM_MCP_OAUTH_HELPER must be a JSON array of command arguments'); }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(value => typeof value === 'string' && value.length > 0)) throw new Error('FCM_MCP_OAUTH_HELPER must be a non-empty JSON string array');
  return parsed;
}

export async function runTokenHelper(
  argv: readonly string[] = helperArgv(),
  limits: TokenHelperLimits = DEFAULT_HELPER_LIMITS,
): Promise<HelperToken> {
  const [command, ...args] = argv;
  if (!command) throw new Error('OAuth token helper command is empty');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false, windowsHide: true });
    const stdout: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail('OAuth token helper timed out'), limits.timeoutMs);
    child.stdout.on('data', chunk => {
      const buffer = Buffer.from(chunk);
      stdoutBytes += buffer.byteLength;
      if (stdoutBytes > limits.stdoutBytes) return fail('OAuth token helper stdout exceeded the size limit');
      stdout.push(buffer);
    });
    child.stderr.on('data', chunk => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > limits.stderrBytes) fail('OAuth token helper stderr exceeded the size limit');
    });
    child.on('error', () => fail('OAuth token helper could not be started'));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`OAuth token helper failed (${code}; stderr ${stderrBytes} bytes)`));
      try {
        const value = JSON.parse(Buffer.concat(stdout).toString('utf8')) as Record<string, unknown>;
        const accessToken = value['access_token'] ?? value['accessToken'];
        if (typeof accessToken !== 'string' || accessToken.length < 16) throw new Error('missing access token');
        const expiresAt = typeof value['expires_at'] === 'number' ? value['expires_at'] : undefined;
        resolve({ accessToken, ...(expiresAt === undefined ? {} : { expiresAt }) });
      } catch { reject(new Error('OAuth token helper returned invalid JSON credentials')); }
    });
  });
}

export function createHelperAuthenticatedFetch(
  baseFetch: typeof fetch = fetch,
  loadToken: () => Promise<HelperToken> = runTokenHelper,
): typeof fetch {
  let cached: HelperToken | undefined;
  const token = async (force = false): Promise<string> => {
    const now = Math.floor(Date.now() / 1000);
    if (force || !cached || (cached.expiresAt !== undefined && cached.expiresAt <= now + 30)) cached = await loadToken();
    return cached.accessToken;
  };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const send = async (force: boolean) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${await token(force)}`);
      return baseFetch(input, { ...init, headers });
    };
    let response = await send(false);
    if (response.status === 401) response = await send(true);
    return response;
  }) as typeof fetch;
}

export async function connectHostedClient(): Promise<RemoteToolClient> {
  const endpoint = new URL(process.env['FCM_MCP_REMOTE_URL'] ?? DEFAULT_REMOTE_URL);
  if (endpoint.protocol !== 'https:' && endpoint.hostname !== 'localhost' && endpoint.hostname !== '127.0.0.1') throw new Error('FCM_MCP_REMOTE_URL must use HTTPS (except loopback development)');
  const client = new Client({ name: 'fcm-stdio-compatibility-bridge', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(endpoint, { fetch: createHelperAuthenticatedFetch() }));
  return client;
}

export function createStdioProxyServer(remote: RemoteToolClient): Server {
  const server = new Server({ name: 'fcm-hosted-bridge', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, request => remote.listTools(request.params));
  server.setRequestHandler(CallToolRequestSchema, request => remote.callTool({ name: request.params.name, ...(request.params.arguments === undefined ? {} : { arguments: request.params.arguments }) }));
  return server;
}

export async function startHostedMcpBridge(): Promise<void> {
  const remote = await connectHostedClient();
  const server = createStdioProxyServer(remote);
  const close = async () => { await Promise.allSettled([server.close(), remote.close()]); };
  process.once('SIGINT', () => { void close().finally(() => process.exit(0)); });
  process.once('SIGTERM', () => { void close().finally(() => process.exit(0)); });
  await server.connect(new StdioServerTransport());
}
