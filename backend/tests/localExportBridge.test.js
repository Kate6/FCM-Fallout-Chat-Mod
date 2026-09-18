const values = new Map(), expiries = new Map(), lists = new Map(), listeners = new Set();
const redis = {
  get: jest.fn(async key => {
    if (expiries.has(key) && expiries.get(key) <= Date.now()) { values.delete(key); expiries.delete(key); }
    return values.get(key) ?? null;
  }),
  set: jest.fn(async (key, value, options = {}) => {
    if (options.NX && await redis.get(key) !== null) return null;
    values.set(key, value);
    if (options.PX || options.EX) expiries.set(key, Date.now() + (options.PX ?? options.EX * 1000));
    return 'OK';
  }),
  del: jest.fn(async key => { values.delete(key); expiries.delete(key); return 1; }),
  eval: jest.fn(async (_script, { keys, arguments: args }) =>
    await redis.get(keys[0]) === args[0] ? redis.del(keys[0]) : 0),
  scanIterator: jest.fn(async function* ({ MATCH }) {
    for (const key of [...values.keys()]) if (key.startsWith(MATCH.slice(0, -1))) yield key;
  }),
  incr: jest.fn(async key => { const next = Number(values.get(key) ?? 0) + 1; values.set(key, String(next)); return next; }),
  expire: jest.fn(async (key, seconds) => { expiries.set(key, Date.now() + seconds * 1000); return 1; }),
  lPush: jest.fn(async (key, value) => { lists.set(key, [value, ...(lists.get(key) ?? [])]); return lists.get(key).length; }),
  lTrim: jest.fn(async (key, first, last) => { lists.set(key, lists.get(key).slice(first, last + 1)); return 'OK'; }),
  lRange: jest.fn(async (key, first, last) => (lists.get(key) ?? []).slice(first, last + 1)),
  publish: jest.fn(async (_channel, body) => { for (const listener of listeners) listener(JSON.parse(body)); return listeners.size; }),
};
const prisma = { user: { findUnique: jest.fn() } };
const environment = { NODE_ENV: 'test', FCM_PUBLIC_BASE_URL: 'https://falloutchatmod.com' };
jest.mock('../src/config/redis', () => ({ getRedisClient: async () => redis }));
jest.mock('../src/config/prisma', () => ({ __esModule: true, default: prisma }));
jest.mock('../src/config/logger', () => ({ __esModule: true, default: { warn: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/config/environment', () => ({ __esModule: true, default: environment }));
jest.mock('../src/services/autoModEngine', () => ({ engineEvaluate: jest.fn(async () => ({ block: false })) }));
jest.mock('../src/services/cosmetics/cosmeticsService', () => ({ attachCosmetics: jest.fn(async value => value) }));
jest.mock('../src/services/supporterSyncService', () => ({ refreshSupporterFromHudSend: jest.fn() }));
const { LocalExportBridge, parseLocalBridgeObservation, localBridgeEnvironment } = require('../src/services/relay/localExportBridge');
const { observeNativeRoster, registerNativeRoomHooks, coordinateRooms, clearRoomMembership } = require('../src/services/relay/roomCoordinator');
const { getWorldId } = require('../src/services/relay/worldIdService');
const { readRoster } = require('../src/services/relay/worldRosterService');
const { getServerHistory } = require('../src/services/relay/serverChat');
const { sendServerMessage } = require('../src/services/relay/serverMessageService');
const { bridgeBindingId } = require('../src/services/relay/overlayServerBridge');
const { BridgeConnection } = require('../src/websocket/bridgeConnection');
const snapshot = (changes = {}) => ({ schemaVersion: 1, environment: 'dev', provider: 'zfe', build: '0.2.0',
  sessionId: 'movie-one', worldGeneration: 'world-one', sequence: 1, observationSequence: 1,
  observationAgeMs: 0, state: 'active', ownName: 'Alice', names: ['Bob'], ...changes });
const hooks = { consumeResync: jest.fn(() => false), clearResync: jest.fn(), rebind: jest.fn(), backfill: jest.fn(async () => {}) };
const desktops = [];
function desktop(account = 'account-a', token = 'session-a') {
  values.set(`session:${token}`, account);
  const current = { value: true }, inGame = { value: true }, frames = [];
  const local = new LocalExportBridge(account, token, () => current.value, () => inGame.value);
  const connection = new BridgeConnection(account, frame => frames.push(frame), () => new Set(), undefined, local);
  desktops.push({ local, connection });
  listeners.add(envelope => { void connection.receive(envelope); });
  return { local, connection, frames, current, inGame, rows: () => frames.flatMap(frame => frame.payload.messages ?? []) };
}
beforeEach(() => {
  jest.clearAllMocks(); values.clear(); expiries.clear(); lists.clear(); listeners.clear();
  jest.spyOn(Date, 'now').mockReturnValue(100_000);
  environment.NODE_ENV = 'test'; environment.FCM_PUBLIC_BASE_URL = 'https://falloutchatmod.com';
  prisma.user.findUnique.mockResolvedValue({ isBanned: false, isMuted: false, kickedUntil: null });
  registerNativeRoomHooks(hooks);
});
afterEach(async () => {
  for (const { local, connection } of desktops.splice(0)) { await local.close(); connection.dispose(); }
  jest.restoreAllMocks();
});

test.each([
  { ...snapshot(), schemaVersion: 2 }, { ...snapshot(), provider: 'other' }, { ...snapshot(), room: 'r:forged' },
  { ...snapshot(), token: 'credential' }, { ...snapshot(), sessionId: 'BAD' }, { ...snapshot(), names: Array(25).fill('Bob') },
  { ...snapshot(), sequence: 0 }, { ...snapshot(), observationSequence: 1.5 }, { ...snapshot(), observationAgeMs: -1 },
  { ...snapshot(), observationAgeMs: Infinity }, { ...snapshot(), ownName: 'x'.repeat(65) },
  { ...snapshot(), names: Array(24).fill('\u0000'.repeat(64)) },
])('bounded strict snapshot rejects invalid input %#', input => expect(parseLocalBridgeObservation(input)).toBeNull());

test('deployment environment is explicit and unknown production URLs fail closed', () => {
  expect(localBridgeEnvironment()).toBe('dev');
  environment.NODE_ENV = 'production'; expect(localBridgeEnvironment()).toBe('prod');
  environment.FCM_PUBLIC_BASE_URL = 'https://dev.falloutchatmod.com'; expect(localBridgeEnvironment()).toBe('dev');
  environment.FCM_PUBLIC_BASE_URL = 'https://other.example'; expect(localBridgeEnvironment()).toBeNull();
});
test('wrong environment, unowned sessions, and missing desktop auth cannot create membership', async () => {
  const a = desktop();
  expect(await a.local.observe(snapshot({ environment: 'prod' }))).toBe(false);
  values.set('session:session-a', 'different-account');
  expect(await a.local.observe(snapshot())).toBe(false);
  expect(await getWorldId(a.local.actorId)).toBeNull();
});
test('new mode never resolves another device/account lease while no file exists', async () => {
  const deps = { resolve: jest.fn(), history: getServerHistory, sendMessage: sendServerMessage };
  const frames = [], noDesktop = new BridgeConnection('account-a', frame => frames.push(frame), () => new Set(), deps);
  await noDesktop.watch('local-export'); await noDesktop.watch(); await noDesktop.observe(snapshot());
  expect(deps.resolve).not.toHaveBeenCalled(); expect(frames).toEqual([{ type: 'bridge:state', payload: { status: 'inactive' } }]);
});

test('leave synchronously fences in-flight and queued observations, then permits fresh recovery', async () => {
  const a = desktop();
  await a.local.initialize();
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  prisma.user.findUnique.mockImplementationOnce(() => {
    entered();
    return new Promise(resolve => { release = () => resolve({ isBanned: false, kickedUntil: null }); });
  });
  const first = a.connection.observe(snapshot());
  await waiting;
  const queued = a.connection.observe(snapshot({ sequence: 2, observationSequence: 2 }));
  const leaving = a.connection.leave();
  expect(a.frames.at(-1).payload.status).toBe('inactive');
  release();
  await Promise.all([first, queued, leaving]);
  expect(a.frames.some(frame => frame.payload.status === 'ready')).toBe(false);
  expect(await getWorldId(a.local.actorId)).toBeNull();
  expect((await a.local.resolve()).status).toBe('inactive');
  await a.connection.observe(snapshot({ sequence: 3, observationSequence: 3 }));
  expect((await a.local.resolve()).status).toBe('ready');
});

test('backend queue and auth latency consume observation freshness rather than renew it', async () => {
  const a = desktop();
  await a.local.initialize();
  prisma.user.findUnique.mockImplementationOnce(async () => {
    Date.now.mockReturnValue(131_000);
    return { isBanned: false, kickedUntil: null };
  });
  await a.connection.observe(snapshot(), 100_000);
  expect((await a.local.resolve()).status).toBe('inactive');
  expect(await getWorldId(a.local.actorId)).toBeNull();
  expect(a.frames.some(frame => frame.payload.status === 'ready')).toBe(false);
});

test('leave during retained-history read drops late history and ready confirmations', async () => {
  const a = desktop();
  await a.local.observe(snapshot());
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const frames = [];
  const connection = new BridgeConnection('account-a', frame => frames.push(frame), () => new Set(), {
    resolve: jest.fn(), sendMessage: sendServerMessage,
    history: () => { entered(); return new Promise(resolve => { release = () => resolve([]); }); },
  }, a.local);
  const watching = connection.watch('local-export');
  await waiting;
  const leaving = connection.leave(), boundary = frames.length;
  release();
  await Promise.all([watching, leaving]);
  expect(frames.slice(boundary).some(frame => frame.type === 'bridge:history' || frame.payload.status === 'ready')).toBe(false);
  connection.dispose();
});

test.each(['zfe', 'xscal'].flatMap(hud => ['zfe', 'xscal'].flatMap(bridge => ['hud', 'desktop'].map(departing => [hud, bridge, departing]))))
  ('HUD %s and desktop %s share canonical history when %s leaves', async (_hudProvider, bridgeProvider, departing) => {
    // Native protocol is provider-neutral: both extenders call the same ROSTER dispatcher.
    const a = desktop();
    await observeNativeRoster('user_b', '  BOB ', [' ALICE '], 'hud-one');
    const before = await getWorldId('user_b');
    await a.connection.observe(snapshot({ provider: bridgeProvider }));
    const ready = await a.local.resolve(), room = ready.binding.room;
    expect(await getWorldId('user_b')).toBe(room);
    expect(hooks.rebind).toHaveBeenCalledWith('user_b', room);
    expect(hooks.backfill).toHaveBeenCalledWith('user_b', room, 'hud-one');
    expect(room).toBe(before); // New mutual member joins the existing canonical room.
    const native = await sendServerMessage({ accountId: 'account-b', relayUserId: 'user_b', displayName: 'Bob' }, room, 'native says hello');
    await a.connection.watch('local-export');
    await a.connection.send(`server:${room}`, bridgeBindingId(ready.binding), 'desktop says hello');
    await a.connection.watch();
    const history = await getServerHistory(room, 0, 50);
    expect(history.map(row => row.body)).toEqual(['native says hello', 'desktop says hello']);
    expect(a.rows().map(row => row.id)).toEqual(history.map(row => row.messageId));
    expect(a.rows().filter(row => row.id === native.messageId)).toHaveLength(1);
    expect(redis.publish.mock.calls.map(([, data]) => JSON.parse(data)).filter(e => e.kind === 'msg')).toHaveLength(2);
    const replay = [];
    const reload = new BridgeConnection('account-a', frame => replay.push(frame), () => new Set(), undefined, a.local);
    await reload.watch('local-export');
    expect(replay.flatMap(frame => frame.payload.messages ?? []).map(row => row.id)).toEqual(history.map(row => row.messageId));
    if (departing === 'hud') {
      await coordinateRooms(assertCurrent => clearRoomMembership('user_b', assertCurrent));
      await a.connection.observe(snapshot({ provider: bridgeProvider, names: [], sequence: 2, observationSequence: 2 }));
      expect((await a.local.resolve()).binding.room).toBe(room);
      expect(await getWorldId('user_b')).toBeNull();
    } else {
      await a.local.close();
      await observeNativeRoster('user_b', 'Bob', [], 'hud-one');
      expect(await getWorldId('user_b')).toBe(room);
    }
    expect((await getServerHistory(room, 0, 50)).map(row => row.messageId)).toEqual(history.map(row => row.messageId));
    reload.dispose();
  });

test('bridge to bridge converges across providers; absent/one-sided sightings and isolated peers remain separated', async () => {
  const a = desktop(), b = desktop('account-b', 'session-b'), c = desktop('account-c', 'session-c');
  await a.connection.observe(snapshot());
  await b.connection.observe(snapshot({ provider: 'xscal', ownName: 'Bob', names: [] }));
  await c.connection.observe(snapshot({ ownName: 'Carol', names: ['Alice'] }));
  const original = (await a.local.resolve()).binding.room;
  expect((await b.local.resolve()).binding.room).not.toBe(original);
  expect((await c.local.resolve()).binding.room).not.toBe(original);
  await b.connection.observe(snapshot({ provider: 'xscal', ownName: 'Bob', names: ['Alice'], sequence: 2, observationSequence: 2 }));
  await a.connection.watch();
  const first = (await a.local.resolve()).binding, second = (await b.local.resolve()).binding;
  expect(first.room).toBe(second.room); expect((await c.local.resolve()).binding.room).not.toBe(first.room);
  await a.connection.send(`server:${first.room}`, bridgeBindingId(first), 'a to b');
  await b.connection.send(`server:${second.room}`, bridgeBindingId(second), 'b to a');
  await Promise.all([a.connection.watch(), b.connection.watch(), c.connection.watch()]);
  expect(a.rows().map(r => r.content)).toEqual(['a to b', 'b to a']);
  expect(b.rows().map(r => r.content)).toEqual(['a to b', 'b to a']); expect(c.rows()).toEqual([]);
});

test('native to native retains shared room assignment and clears pending resync on leave', async () => {
  await observeNativeRoster('user_a', 'Alice', ['Bob'], 'hud-a');
  await observeNativeRoster('user_b', 'Bob', ['Alice'], 'hud-b');
  expect(await getWorldId('user_a')).toBe(await getWorldId('user_b'));
  await coordinateRooms(assert => clearRoomMembership('user_a', assert));
  expect(await getWorldId('user_a')).toBeNull(); expect(hooks.clearResync).toHaveBeenCalledWith('user_a');
});

test('heartbeat age cannot refresh observation expiry; fast travel holding preserves only the original room deadline', async () => {
  const a = desktop(); await a.local.observe(snapshot()); const original = (await a.local.resolve()).binding.room;
  const scans = redis.scanIterator.mock.calls.length;
  const rosterWrites = () => redis.set.mock.calls.filter(([key]) => key.startsWith('relay:roster:')).length;
  const writes = rosterWrites();
  Date.now.mockReturnValue(120_000);
  expect(await a.local.observe(snapshot({ state: 'holding', sequence: 2, observationAgeMs: 20_000 }))).toBe(true);
  expect((await a.local.resolve()).binding.room).toBe(original);
  await a.local.observe(snapshot({ sequence: 3, observationAgeMs: 0 }));
  expect(redis.scanIterator).toHaveBeenCalledTimes(scans);
  expect(rosterWrites()).toBe(writes);
  Date.now.mockReturnValue(130_000);
  expect(await a.local.resolve()).toEqual({ status: 'inactive' });
  expect(await readRoster(a.local.actorId)).toBeNull();
  await a.local.observe(snapshot({ sequence: 4, observationAgeMs: 0 }));
  expect(await a.local.resolve()).toEqual({ status: 'inactive' });
  await a.local.observe(snapshot({ sequence: 5, observationSequence: 2 }));
  expect((await a.local.resolve()).status).toBe('ready');
});

test('later observation advances expiry; same observation cannot mutate sightings or enter a new world', async () => {
  const a = desktop(); await a.local.observe(snapshot());
  Date.now.mockReturnValue(120_000);
  expect(await a.local.observe(snapshot({ names: ['Eve'], sequence: 2 }))).toBe(false);
  expect(await a.local.observe(snapshot({ worldGeneration: 'world-two', sequence: 2 }))).toBe(false);
  expect(await a.local.observe(snapshot({ sequence: 2, observationSequence: 2 }))).toBe(true);
  Date.now.mockReturnValue(140_000); expect((await a.local.resolve()).status).toBe('ready');
});

test('hop/session replacement rejects retired generations and stale send confirmations, excludes old history', async () => {
  const a = desktop(); await a.connection.observe(snapshot()); const first = (await a.local.resolve()).binding;
  await a.connection.send(`server:${first.room}`, bridgeBindingId(first), 'previous world');
  await a.connection.watch();
  const before = a.rows().length;
  await a.connection.observe(snapshot({ worldGeneration: 'world-two', sequence: 2, observationSequence: 2 }));
  const second = (await a.local.resolve()).binding;
  expect(second.room).not.toBe(first.room); expect(a.rows()).toHaveLength(before);
  await a.connection.send(`server:${first.room}`, bridgeBindingId(first), 'late old send');
  expect(await getServerHistory(second.room, 0, 50)).toEqual([]);
  expect(await a.local.observe(snapshot({ sequence: 3, observationSequence: 3 }))).toBe(false);
  await a.local.observe(snapshot({ sessionId: 'movie-two' }));
  expect(await a.local.observe(snapshot({ worldGeneration: 'world-three', sequence: 100, observationSequence: 100 }))).toBe(false);
});

test('inactive empty snapshots, logout/account rebind, ban and exact socket close fail closed', async () => {
  const a = desktop(); await a.local.observe(snapshot());
  await a.local.observe(snapshot({ state: 'inactive', sequence: 2, ownName: '', names: [] }));
  expect(await a.local.resolve()).toEqual({ status: 'inactive' });
  await a.local.observe(snapshot({ sequence: 3, observationSequence: 2 }));
  const replacement = desktop(); await replacement.local.initialize();
  expect(await a.local.observe(snapshot({ sequence: 4, observationSequence: 3 }))).toBe(false);
  await replacement.local.observe(snapshot({ sequence: 4, observationSequence: 3 }));
  await a.local.close(); expect((await replacement.local.resolve()).status).toBe('ready');
  values.set('session:session-a', 'other-account'); expect(await replacement.local.resolve()).toEqual({ status: 'inactive' });
  values.set('session:session-a', 'account-a'); prisma.user.findUnique.mockResolvedValue({ isBanned: true });
  expect(await replacement.local.resolve()).toEqual({ status: 'inactive' });
  await replacement.local.close(); expect(await getWorldId(replacement.local.actorId)).toBeNull();
});

test('different device of same account cannot watch/send/leave the active actor', async () => {
  const a = desktop(), other = desktop('account-a', 'other-device');
  await a.connection.observe(snapshot()); const bound = (await a.local.resolve()).binding;
  await other.connection.watch('local-export'); await other.connection.send(`server:${bound.room}`, bridgeBindingId(bound), 'forged');
  await other.local.leave();
  expect((await a.local.resolve()).status).toBe('ready'); expect(other.rows()).toEqual([]);
  expect(await getServerHistory(bound.room, 0, 50)).toEqual([]);
});

test('old lazy socket on another replica cannot steal newer authenticated connection ownership', async () => {
  const old = desktop();
  const next = desktop(); // Both replica-local current callbacks remain true.
  await next.local.observe(snapshot({ sequence: 2, observationSequence: 2 }));
  expect((await next.local.resolve()).status).toBe('ready');
  await old.connection.watch('local-export');
  expect(await old.local.observe(snapshot({ sequence: 3, observationSequence: 3 }))).toBe(false);
  expect(await old.local.resolve()).toEqual({ status: 'inactive' });
  await old.local.close();
  expect((await next.local.resolve()).status).toBe('ready');
});

test('device game exit blocks observations/history/send immediately without borrowing peer game presence', async () => {
  const a = desktop(), peer = desktop('account-a', 'other-device');
  await a.connection.observe(snapshot());
  const first = (await a.local.resolve()).binding;
  a.inGame.value = false;
  expect(peer.inGame.value).toBe(true);
  expect(await a.local.observe(snapshot({ sequence: 2, observationSequence: 2 }))).toBe(false);
  expect(await a.local.resolve()).toEqual({ status: 'inactive' });
  await a.connection.send(`server:${first.room}`, bridgeBindingId(first), 'after exit');
  expect(await getServerHistory(first.room, 0, 50)).toEqual([]);
  await a.connection.leave();
  expect(await getWorldId(a.local.actorId)).toBeNull();
});

test('expiry or revocation during moderation prevents publication', async () => {
  const a = desktop(); await a.connection.observe(snapshot()); const bound = (await a.local.resolve()).binding;
  require('../src/services/autoModEngine').engineEvaluate.mockImplementationOnce(async () => {
    Date.now.mockReturnValue(130_000); return { block: false };
  });
  await a.connection.send(`server:${bound.room}`, bridgeBindingId(bound), 'too late');
  expect(await getServerHistory(bound.room, 0, 50)).toEqual([]);
});

test('initial holding and exactly expired observations cannot invent a membership', async () => {
  const a = desktop();
  expect(await a.local.observe(snapshot({ state: 'holding' }))).toBe(false);
  expect(await a.local.resolve()).toEqual({ status: 'inactive' });
  await a.local.observe(snapshot({ observationAgeMs: 30_000 }));
  expect(await a.local.resolve()).toEqual({ status: 'inactive' });
  expect(await getWorldId(a.local.actorId)).toBeNull();
});

test('late old-room rebind announcement cannot confirm or replay the previous generation', async () => {
  const a = desktop(); await a.connection.observe(snapshot()); const old = (await a.local.resolve()).binding;
  await a.connection.observe(snapshot({ worldGeneration: 'world-two', sequence: 2, observationSequence: 2 }));
  const before = a.frames.length;
  await a.connection.receive({ kind: 'rebind', userId: a.local.actorId, worldId: old.room, requestId: old.requestId });
  expect(a.frames.slice(before).filter(frame => frame.type === 'bridge:state' && frame.payload.worldGeneration === 'world-one')).toEqual([]);
  expect((await a.local.resolve()).binding.worldGeneration).toBe('world-two');
});

test('slow resolution cannot confirm a room superseded by a peer assignment', async () => {
  const a = desktop(); await a.local.observe(snapshot());
  const baseGet = redis.get.getMockImplementation(); let stateReads = 0;
  redis.get.mockImplementation(async key => {
    if (key === `relay:local-export:${a.local.actorId}` && ++stateReads === 2) {
      values.set(`relay:world:${a.local.actorId}`, 'r:reassigned-by-peer');
    }
    return baseGet(key);
  });
  try { expect(await a.local.resolve()).toEqual({ status: 'inactive' }); }
  finally { redis.get.mockImplementation(baseGet); }
});

test('unchanged writer heartbeats do not emit or read another history snapshot', async () => {
  const a = desktop(); await a.connection.observe(snapshot());
  const historyReads = redis.lRange.mock.calls.length;
  const histories = a.frames.filter(frame => frame.type === 'bridge:history').length;
  Date.now.mockReturnValue(105_000);
  await a.connection.observe(snapshot({ sequence: 2, observationAgeMs: 5000 }));
  expect(redis.lRange).toHaveBeenCalledTimes(historyReads);
  expect(a.frames.filter(frame => frame.type === 'bridge:history')).toHaveLength(histories);
});
