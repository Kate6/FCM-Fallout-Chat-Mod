import express from 'express';
import { spawn } from 'node:child_process';
import { createMcpTransportRouter } from '../dist/mcp/transport.js';

const app = express();
app.use('/mcp', createMcpTransportRouter({
  authorizationService: { verifyAccessToken: async () => ({
    discordId: 'inspector-smoke', clientId: 'inspector-cli', role: 'admin', scopes: ['fcm:read'], grantId: 'inspector-smoke',
  }) },
  enabled: () => true,
  allowedOrigins: () => [],
  resourceUrl: () => 'https://falloutchatmod.com/mcp',
  rateLimit: async () => true,
}));

const listener = app.listen(0, '127.0.0.1');
await new Promise((resolve, reject) => {
  listener.once('listening', resolve);
  listener.once('error', reject);
});

const url = `http://127.0.0.1:${listener.address().port}/mcp`;
const common = [url, '--transport', 'http', '--header', 'Authorization: Bearer inspector-token', '--format', 'json'];
try {
  await run([...common, '--method', 'initialize'], 'initialize');
  await run([...common, '--method', 'tools/list'], 'tools/list');
  await run([...common, '--method', 'tools/call', '--tool-name', 'fcm_context_get'], 'tools/call');
  process.stdout.write('MCP Inspector initialize/list/call smoke passed\n');
} finally {
  await new Promise(resolve => listener.close(resolve));
}

// Importing the production registry also initializes shared infrastructure
// clients whose reconnect timers intentionally keep a backend process alive.
// This is a bounded one-shot CI smoke, so terminate after the listener and all
// Inspector children have closed instead of waiting on those application loops.
process.exit(0);

async function run(args, label) {
  const child = spawn(process.execPath, ['./node_modules/@modelcontextprotocol/inspector/clients/cli/build/index.js', ...args], {
    cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15_000);
  const status = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
  clearTimeout(timeout);
  if (status !== 0) throw new Error(`Inspector ${label} failed (${status}): ${stderr || stdout}`);
}
