import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ServerModerationConnection } from '../serverModerationConnection';
import { authorizeServerModeration } from '../serverModerationAuthorization';

test('actual desktop handler cases reject web/superseded sockets and revoke fresh database role', async () => {
  const source = readFileSync('src/websocket/handlers.ts', 'utf8');
  const start = source.indexOf("      case 'server:moderation:subscribe':");
  const end = source.indexOf("      case 'bridge:watch':", start);
  assert.ok(start > 0 && end > start);
  const ws = {}; const clients = new Map([['token', { ws }]]);
  const frames: Array<{ payload: Record<string, unknown> }> = [];
  let webTicketUserId: string | null = null; let role = 'moderator';
  const serverModeration = new ServerModerationConnection(f => frames.push(f), {
    authorize: () => authorizeServerModeration('account', !!webTicketUserId, {
      current: () => clients.get('token')?.ws === ws, session: async () => 'account',
      account: async () => ({ discordId: 'd', isBanned: false, kickedUntil: null }), role: async () => role,
    }), history: async () => ({ messages: [], nextCursor: null }),
  });
  const dispatch = async () => runInNewContext(`(async () => { switch (frame.type) { ${source.slice(start, end)} } })()`, {
    frame: { type: 'server:moderation:subscribe', payload: { enabled: true } }, webTicketUserId,
    clients, token: 'token', ws, user: { id: 'account' }, serverModeration, checkWsRateLimitBucket: async () => true,
  });
  webTicketUserId = 'web-user'; await dispatch(); assert.equal(frames.length, 0);
  webTicketUserId = null; clients.set('token', { ws: {} }); await dispatch(); assert.equal(frames.length, 0);
  clients.set('token', { ws }); await dispatch(); assert.equal(frames[0].payload.status, 'ready');
  role = 'user'; await serverModeration.receive(async () => ({ id: '1', channelId: 'server:a', serverDisplayId: '1' }));
  assert.equal(frames.at(-1)?.payload.status, 'denied');
  assert.match(source, /clients\.get\(token\)\?\.serverModeration\?\.dispose\(\)/);
  const native = readFileSync('src/services/relay/relayHandler.ts', 'utf8');
  assert.ok(!native.includes('server:moderation:subscribe'));
});
