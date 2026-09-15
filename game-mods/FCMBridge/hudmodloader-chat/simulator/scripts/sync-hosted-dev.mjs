#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const simulator = resolve(here, '..');
const backendWs = resolve(simulator, '../../../../backend/node_modules/ws/wrapper.mjs');
const output = resolve(simulator, 'public/hosted-dev-snapshot.json');
const base = 'https://dev.falloutchatmod.com';
const clientVersion = '1.3.99';
export const HOSTED_HISTORY_PER_CHANNEL = 50;

export function mapHistory(channels, batches) {
  const normalizedSlug = channel => {
    const value = String(channel.slug || channel.name || '').toLowerCase();
    if (value === 'general') return 'global';
    if (value === 'trading') return 'trade';
    return value;
  };
  const slugById = new Map(channels.map(channel => [channel.id, normalizedSlug(channel)]));
  let cursor = 0;
  const byChannel = new Map();
  for (const message of batches.flatMap(batch => batch.messages || [])) {
    const channelId = message.channel_id || message.channelId || '';
    const rows = byChannel.get(channelId) || [];
    rows.push(message);
    byChannel.set(channelId, rows);
  }
  const messages = [...byChannel.values()].flatMap(rows => rows
    .sort((left, right) => {
      const leftAt = Date.parse(left.created_at || left.createdAt || 0) || 0;
      const rightAt = Date.parse(right.created_at || right.createdAt || 0) || 0;
      return leftAt - rightAt;
    })
    .slice(-HOSTED_HISTORY_PER_CHANNEL)).sort((left, right) => {
    const leftAt = Date.parse(left.created_at || left.createdAt || 0) || 0;
    const rightAt = Date.parse(right.created_at || right.createdAt || 0) || 0;
    return leftAt - rightAt;
  });
  return messages.map(message => ({
    kind: 'chat.message',
    id: ++cursor,
    messageId: String(message.id || `dev-${cursor}`),
    channel: String(slugById.get(message.channel_id || message.channelId) || 'global'),
    senderUserId: String(message.user_id || message.userId || ''),
    senderDisplayName: String(message.username || message.displayName || 'DEV User'),
    body: String(message.content || message.body || '').slice(0, 500),
    tag: String(message.tag || ''),
    nameColor: String(message.nameColor || ''),
    starColor: String(message.starColor || ''),
    supporterStar: Boolean(message.supporterStar),
    targetUserId: '',
  })).filter(event => event.body.length > 0);
}

function keyringSecret() {
  return execFileSync('secret-tool', ['lookup', 'service', 'fcm-overlay', 'environment', 'dev'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

async function sync() {
  const secret = process.env.DEV_PERSONA_LOGIN_SECRET?.trim() || keyringSecret();
  if (!secret) throw new Error('Hosted DEV key is unavailable');
  const login = await fetch(`${base}/api/dev/login-as`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-dev-persona-key': secret },
    body: JSON.stringify({ persona: 'user', installToken: randomUUID() }),
  });
  if (!login.ok) throw new Error(`Hosted DEV login failed (${login.status})`);
  const token = (await login.json())?.data?.token;
  if (!token) throw new Error('Hosted DEV login returned no session token');

  const channelResponse = await fetch(`${base}/api/channels`, {
    headers: { 'x-auth-token': token, 'x-client-version': clientVersion },
  });
  if (!channelResponse.ok) throw new Error(`Hosted DEV channels failed (${channelResponse.status})`);
  const channelEnvelope = await channelResponse.json();
  const roots = channelEnvelope.data || channelEnvelope;
  const tree = Array.isArray(roots) ? roots : roots.channels || [];
  const channels = [...new Map(tree.flatMap(channel => [channel, ...(channel.children || [])])
    .filter(channel => channel.id && !String(channel.id).startsWith('server:'))
    .map(channel => [channel.id, channel])).values()];

  const { default: WebSocket } = await import(pathToFileURL(backendWs).href);
  const batches = [];
  await new Promise((resolvePromise, reject) => {
    const socket = new WebSocket('wss://dev.falloutchatmod.com/ws', {
      headers: { 'X-Auth-Token': token, 'x-client-version': clientVersion },
    });
    const timer = setTimeout(() => { socket.close(); reject(new Error('Hosted DEV history timed out')); }, 15_000);
    socket.on('open', () => channels.forEach(channel => socket.send(JSON.stringify({
      type: 'chat:history', payload: { channelId: channel.id, limit: HOSTED_HISTORY_PER_CHANNEL },
    }))));
    socket.on('message', raw => {
      let frame;
      try { frame = JSON.parse(String(raw)); } catch { return; }
      if (frame.type !== 'chat:history') return;
      batches.push({ messages: frame.payload?.messages || [] });
      if (batches.length === channels.length) {
        clearTimeout(timer); socket.close(); resolvePromise();
      }
    });
    socket.on('error', reject);
    socket.on('close', (code, reason) => {
      if (code === 4003) reject(new Error(`Hosted DEV build gate rejected ${clientVersion}: ${String(reason)}`));
    });
  });

  const events = mapHistory(channels, batches);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({
    schemaVersion: 1,
    source: 'hosted-dev',
    capturedAtUtc: new Date().toISOString(),
    channelCount: channels.length,
    events,
  }, null, 2) + '\n', { mode: 0o600 });
  console.log(`Hosted DEV snapshot ready: ${events.length} fake messages across ${channels.length} channels`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  sync().catch(error => { console.error(error.message); process.exitCode = 1; });
}
