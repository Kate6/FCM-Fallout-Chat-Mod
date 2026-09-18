import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ServerModerationConnection, type ModerationRow, type ModerationPage } from '../serverModerationConnection';

const row = (id = '1', room = 'a'): ModerationRow => ({ id, channelId: `server:${room}`, serverDisplayId: '123' });
test('mute expiry is bounded, authenticated and discarded after revocation', async () => {
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let allowed = true; let calls = 0; let revokeDuringRead = false;
  const c = new ServerModerationConnection(f => frames.push(f), {
    authorize: async () => allowed,
    history: async () => ({ messages: [], nextCursor: null }),
    expiredRooms: async ids => { calls++; if (revokeDuringRead) allowed = false; return [...ids, 'server:r:unrequested']; },
  });
  await c.pruneMutes(['server:r:gone']); assert.equal(calls, 0);
  await c.subscribe(true);
  await c.pruneMutes(Array(501).fill('server:r:gone'));
  await c.pruneMutes(['../../session']); assert.equal(calls, 0);
  await c.pruneMutes(['server:r:gone', 'server:r:gone']);
  assert.deepEqual(frames.at(-1), { type: 'server:moderation:expired', payload: { channelIds: ['server:r:gone'] } });
  revokeDuringRead = true;
  await c.pruneMutes(['server:r:other']);
  assert.equal(frames.at(-1)?.payload.status, 'denied');
  assert.equal(frames.filter(f => f.type === 'server:moderation:expired').length, 1);
});
function fixture() {
  const frames: Array<{ type: string; payload: Record<string, unknown> }> = [];
  let allowed = true;
  let historyCalls = 0;
  const connection = new ServerModerationConnection(f => frames.push(f), {
    authorize: async () => allowed,
    history: async () => { historyCalls++; return { messages: [row()], nextCursor: null }; },
  });
  return { connection, frames, revoke: () => { allowed = false; }, historyCalls: () => historyCalls };
}
test('no implicit subscription; unauthorized client cannot load history or live rows', async () => {
  const f = fixture(); let loaded = false;
  await f.connection.receive(async () => { loaded = true; return row(); });
  f.revoke(); await f.connection.subscribe(true);
  assert.equal(loaded, false); assert.equal(f.historyCalls(), 0);
  assert.deepEqual(f.frames.map(f => f.payload.status), ['denied']);
});
test('history/live share IDs and dedupe; distinct rooms retain their context', async () => {
  const f = fixture(); await f.connection.subscribe(true);
  await f.connection.receive(async () => row());
  await f.connection.receive(async () => row('2', 'b'));
  assert.equal(f.frames.length, 3);
  assert.equal(f.frames[1].payload.historyReplay, true);
  assert.equal(f.frames[2].payload.historyReplay, false);
  assert.deepEqual(f.frames[2].payload.messages, [row('2', 'b')]);
});
test('role/session revocation blocks next delivery and clears subscription', async () => {
  const f = fixture(); await f.connection.subscribe(true); f.revoke();
  await f.connection.receive(async () => row('2'));
  assert.equal(f.frames.at(-1)?.payload.status, 'denied');
  assert.equal(f.frames.filter(f => f.type.endsWith(':messages')).length, 1);
});
test('revocation while history is pending prevents response', async () => {
  let release!: (r: ModerationPage) => void; let allowed = true;
  const frames: unknown[] = [];
  const c = new ServerModerationConnection(f => frames.push(f), { authorize: async () => allowed,
    history: () => new Promise(resolve => { release = resolve; }) });
  const pending = c.subscribe(true); await new Promise(r => setImmediate(r));
  allowed = false; release({ messages: [row()], nextCursor: null }); await pending;
  assert.deepEqual(frames, [{ type: 'server:moderation:state', payload: { status: 'denied' } }]);
});
test('unsubscribe/dispose cancel in-flight work; no delayed data after logout', async () => {
  for (const dispose of [true, false]) {
    let release!: (r: ModerationPage) => void; const frames: unknown[] = [];
    const c = new ServerModerationConnection(f => frames.push(f), { authorize: async () => true,
      history: () => new Promise(resolve => { release = resolve; }) });
    const pending = c.subscribe(true); await new Promise(r => setImmediate(r));
    if (dispose) c.dispose(); else await c.subscribe(false);
    release({ messages: [row()], nextCursor: null }); await pending;
    assert.equal(frames.length, dispose ? 0 : 1);
  }
});
test('history response capped at 500 and authorization failures fail closed', async () => {
  const frames: Array<{ payload: Record<string, unknown> }> = [];
  const c = new ServerModerationConnection(f => frames.push(f), { authorize: async () => true,
    history: async () => ({ messages: Array.from({ length: 600 }, (_, i) => row(String(i))), nextCursor: null }) });
  await c.subscribe(true); assert.equal((frames[1].payload.messages as unknown[]).length, 500);
  const bad = new ServerModerationConnection(f => frames.push(f), { authorize: async () => { throw Error('down'); }, history: async () => ({ messages: [], nextCursor: null }) });
  await bad.subscribe(true); assert.equal(frames.at(-1)?.payload.status, 'unavailable');
});
test('pagination requires issued cursor, reports completion even for empty pages, and reauthorizes', async () => {
  const frames: Array<{ payload: Record<string, unknown> }> = []; let allowed = true; let calls = 0;
  const c = new ServerModerationConnection(f => frames.push(f), { authorize: async () => allowed,
    history: async cursor => { calls++; return { messages: cursor ? [] : [row()], nextCursor: cursor ? null : 'room-a' }; } });
  await c.subscribe(true);
  assert.equal(frames.at(-1)?.payload.hasMore, true);
  await c.history('forged'); assert.equal(calls, 1);
  await c.history('room-a'); assert.equal(calls, 2);
  assert.deepEqual(frames.at(-1)?.payload, { messages: [], historyReplay: true, hasMore: false, nextCursor: null });
  await c.subscribe(false); await c.subscribe(true); allowed = false;
  await c.history('room-a'); assert.equal(calls, 3);
  assert.equal(frames.at(-1)?.payload.status, 'denied');
});
test('overflow disables subscription and explicit refresh can recover', async () => {
  const frames: Array<{ payload: Record<string, unknown> }> = [];
  const c = new ServerModerationConnection(f => frames.push(f), { authorize: async () => true,
    history: async () => ({ messages: [], nextCursor: null }) });
  await c.subscribe(true);
  await Promise.all(Array.from({ length: 129 }, () => c.validate()));
  assert.equal(frames.at(-1)?.payload.status, 'unavailable');
  await c.subscribe(true);
  assert.equal(frames.at(-2)?.payload.status, 'ready');
});
