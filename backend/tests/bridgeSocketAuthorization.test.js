const { EventEmitter } = require('events');
const { WebSocket } = require('ws');
const store = new Map();
const redis = {
  get: jest.fn(async key => store.get(key) ?? null), del: jest.fn(async key => store.delete(key)),
  set: jest.fn(async () => 'OK'), incr: jest.fn(async () => 1), expire: jest.fn(async () => 1),
  on: jest.fn(), publish: jest.fn(async () => 1), sendCommand: jest.fn(async () => 'OK'),
};
jest.mock('../src/config/redis', () => ({ getRedisClient: async () => redis,
  getSubscriberClient: async () => ({ subscribe: jest.fn(), on: jest.fn() }) }));
jest.mock('../src/config/database', () => ({ query: jest.fn(async () => ({ rows: [], rowCount: 0 })), pool: { on: jest.fn() } }));
jest.mock('../src/config/prisma', () => ({ __esModule: true, default: {
  user: { findUnique: jest.fn(async () => ({ id: 'account-a', username: 'Alice', isBanned: false, isMuted: false })) },
} }));
jest.mock('../src/services/blockService', () => ({ getBlockedIds: jest.fn(async () => new Set()) }));
jest.mock('../src/services/userRoleService', () => ({ getEffectiveRole: jest.fn(async () => 'user'), isPrivilegedRole: jest.fn(() => false) }));
const instances = [];
jest.mock('../src/websocket/bridgeConnection', () => ({ BridgeConnection: class {
  constructor(...args) { this.args = args; this.watch = jest.fn(); this.observe = jest.fn(); this.leave = jest.fn(); this.dispose = jest.fn(); instances.push(this); }
} }));
jest.mock('../src/services/relay/localExportBridge', () => ({ LocalExportBridge: class { constructor(...args) { this.args = args; } } }));
const { handleConnection } = require('../src/websocket/handlers');
const sockets = [];
async function connect(url, headers = {}) {
  const ws = new EventEmitter(); ws.readyState = WebSocket.OPEN;
  ws.send = jest.fn(); ws.close = jest.fn(); ws.ping = jest.fn(); ws.terminate = jest.fn();
  sockets.push(ws); await handleConnection(ws, { url, headers }); return ws;
}
async function control(ws, type, payload) {
  for (const listener of ws.listeners('message')) await listener(Buffer.from(JSON.stringify({ type, payload })));
}
beforeEach(() => { store.clear(); instances.length = 0; store.set('session:desktop-token', 'account-a'); });
afterEach(() => { for (const ws of sockets.splice(0)) { ws.readyState = WebSocket.CLOSED; ws.emit('close'); } });

test('only header-authenticated desktop gets local authority and accepts new controls', async () => {
  const ws = await connect('/', { 'x-auth-token': 'desktop-token' });
  const bridge = instances.at(-1), payload = { schemaVersion: 1 };
  expect(bridge.args[4].args.slice(0, 2)).toEqual(['account-a', 'desktop-token']);
  await control(ws, 'bridge:observe', payload);
  expect(bridge.observe).not.toHaveBeenCalled();
  expect(bridge.args[4].args[3]()).toBe(false);
  await control(ws, 'client:status', { inGame: true });
  await control(ws, 'bridge:watch', { mode: 'local-export' });
  await control(ws, 'bridge:observe', payload); await control(ws, 'bridge:leave', {});
  expect(bridge.watch).toHaveBeenCalledWith('local-export'); expect(bridge.observe).toHaveBeenCalledWith(payload, expect.any(Number));
  expect(bridge.leave).toHaveBeenCalledTimes(1);
  await control(ws, 'client:status', { inGame: false });
  expect(bridge.leave).toHaveBeenCalledTimes(2);
  expect(bridge.args[4].args[3]()).toBe(false);
  await control(ws, 'bridge:observe', payload);
  expect(bridge.observe).toHaveBeenCalledTimes(1);
});

test('browser tickets cannot activate legacy or local bridge controls', async () => {
  store.set('ws_ticket:browser', JSON.stringify({ type: 'web', userId: '10000000-0000-4000-8000-000000000001' }));
  const ws = await connect('/?ticket=browser'); const bridge = instances.at(-1);
  expect(bridge.args[4]).toBeUndefined();
  await control(ws, 'bridge:watch', {}); await control(ws, 'bridge:watch', { mode: 'local-export' });
  await control(ws, 'bridge:observe', {}); await control(ws, 'bridge:leave', {});
  expect(bridge.watch).not.toHaveBeenCalled(); expect(bridge.observe).not.toHaveBeenCalled(); expect(bridge.leave).not.toHaveBeenCalled();
});

test('public unauthenticated socket and admin observers never get bridge authority', async () => {
  const publicSocket = await connect('/'); expect(publicSocket.close).toHaveBeenCalled();
  store.set('ws_ticket:admin', 'admin'); const admin = await connect('/?ticket=admin');
  await control(admin, 'bridge:watch', { mode: 'local-export' }); await control(admin, 'bridge:observe', {});
  expect(instances).toHaveLength(0);
});

test('superseded socket cannot mutate newer socket membership', async () => {
  const old = await connect('/', { 'x-auth-token': 'desktop-token' }); const first = instances.at(-1);
  const fresh = await connect('/', { 'x-auth-token': 'desktop-token' }); const second = instances.at(-1);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  await control(old, 'bridge:observe', {}); await control(old, 'bridge:leave', {});
  expect(first.observe).not.toHaveBeenCalled(); expect(first.leave).not.toHaveBeenCalled();
  await control(fresh, 'client:status', { inGame: true });
  await control(fresh, 'bridge:observe', {}); expect(second.observe).toHaveBeenCalledTimes(1);
});
