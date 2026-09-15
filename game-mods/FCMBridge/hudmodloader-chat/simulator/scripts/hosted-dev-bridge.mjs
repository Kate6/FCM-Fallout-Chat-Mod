import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const simulator = resolve(here, '..');
const backendWs = resolve(simulator, '../../../../backend/node_modules/ws/wrapper.mjs');
const base = 'https://dev.falloutchatmod.com';
const clientVersion = '1.3.99';

export function normalizeHudChannel(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (slug === 'general') return 'global';
  if (slug === 'trading') return 'trade';
  return slug;
}

export function validateHostedSend(value, channelIds) {
  const channel = normalizeHudChannel(value?.channel);
  const body = typeof value?.body === 'string' ? value.body.trim() : '';
  if (!channelIds.has(channel)) return { ok: false, status: 400, error: 'invalid_channel' };
  if (!body || body.length > 500) return { ok: false, status: 400, error: 'invalid_body' };
  return { ok: true, channel, channelId: channelIds.get(channel), body };
}

function readSecret() {
  const explicit = process.env.DEV_PERSONA_LOGIN_SECRET?.trim();
  if (explicit) return explicit;
  return execFileSync('secret-tool', ['lookup', 'service', 'fcm-overlay', 'environment', 'dev'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

async function createSession() {
  const secret = readSecret();
  if (!secret) throw new Error('Hosted DEV key is unavailable');
  const login = await fetch(`${base}/api/dev/login-as`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-persona-key': secret },
    body: JSON.stringify({ persona: 'user', installToken: randomUUID() }),
  });
  if (!login.ok) throw new Error(`Hosted DEV login failed (${login.status})`);
  const token = (await login.json())?.data?.token;
  if (!token) throw new Error('Hosted DEV login returned no session token');
  const response = await fetch(`${base}/api/channels`, {
    headers: { 'x-auth-token': token, 'x-client-version': clientVersion },
  });
  if (!response.ok) throw new Error(`Hosted DEV channels failed (${response.status})`);
  const envelope = await response.json();
  const roots = envelope.data || envelope;
  const tree = Array.isArray(roots) ? roots : roots.channels || [];
  const channelIds = new Map();
  for (const channel of tree.flatMap(item => [item, ...(item.children || [])])) {
    if (channel.id && !String(channel.id).startsWith('server:')) {
      channelIds.set(normalizeHudChannel(channel.slug || channel.name), channel.id);
    }
  }
  return { token, channelIds };
}

async function sendFrame(session, value) {
  const valid = validateHostedSend(value, session.channelIds);
  if (!valid.ok) return valid;
  const { default: WebSocket } = await import(pathToFileURL(backendWs).href);
  return new Promise((resolvePromise, reject) => {
    const socket = new WebSocket('wss://dev.falloutchatmod.com/ws', {
      headers: { 'X-Auth-Token': session.token, 'x-client-version': clientVersion },
    });
    const finish = result => { clearTimeout(timer); try { socket.close(); } catch {} resolvePromise(result); };
    const timer = setTimeout(() => { try { socket.close(); } catch {} reject(new Error('Hosted DEV send timed out')); }, 10_000);
    socket.on('open', () => socket.send(JSON.stringify({
      type: 'chat:send',
      payload: { channelId: valid.channelId, content: valid.body, clientCreatedAt: new Date().toISOString() },
    })));
    socket.on('message', raw => {
      let frame;
      try { frame = JSON.parse(String(raw)); } catch { return; }
      if (frame.type === 'message:ack') finish({ ok: true, status: 200, messageId: frame.payload?.messageId || '' });
      if (frame.type === 'error') finish({ ok: false, status: 502, error: frame.payload?.code || 'remote_error' });
    });
    socket.on('error', reject);
    socket.on('close', (code, reason) => {
      if (code === 4003) reject(new Error(`Hosted DEV build gate rejected ${clientVersion}: ${String(reason)}`));
    });
  });
}

export function createHostedDevBridge() {
  let sessionPromise;
  const session = () => sessionPromise ||= createSession();
  return {
    async status() {
      const value = await session();
      return { enabled: true, authenticated: true, channels: value.channelIds.size };
    },
    async send(value) { return sendFrame(await session(), value); },
  };
}
