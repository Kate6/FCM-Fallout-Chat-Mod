function createFakeRedis() {
  const sets = new Map();
  const activity = new Map();
  const prune = (_key, _min, max) => { for (const [id, score] of activity) if (score <= Number(max)) activity.delete(id); };

  return {
    isReady: true,
    withCommandOptions() { return this; },
    multi() {
      const ops = [];
      return {
        zRemRangeByScore(...args) { ops.push(() => prune(...args)); return this; },
        zAdd(_key, entry) { ops.push(() => activity.set(entry.value, Math.max(activity.get(entry.value) ?? 0, entry.score))); return this; },
        del(key) {
          ops.push(() => { sets.delete(key); });
          return this;
        },
        sAdd(key, members) {
          ops.push(() => {
            const values = Array.isArray(members) ? members : [members];
            sets.set(key, new Set(values));
          });
          return this;
        },
        expire() {
          ops.push(() => {});
          return this;
        },
        async exec() {
          ops.forEach((op) => op());
          return [];
        },
      };
    },
    async sMembers(key) {
      return Array.from(sets.get(key) ?? []);
    },
    async zRemRangeByScore(...args) { prune(...args); },
    async zRangeByScore(_key, min) { return [...activity].filter(([, score]) => score > Number(String(min).replace('(', ''))).map(([id]) => id); },
    async *scanIterator({ MATCH }) {
      const prefix = MATCH.replace(/\*/g, '');
      for (const key of sets.keys()) {
        if (key.startsWith(prefix)) yield key;
      }
    },
    _sets: sets,
  };
}

describe('onlinePresenceService', () => {
  let fakeRedis;
  let service;
  let accountRows;

  beforeEach(() => {
    jest.resetModules();
    fakeRedis = createFakeRedis();
    accountRows = [];
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-17T12:00:00Z'));
    jest.doMock('../src/config/prisma', () => ({ __esModule: true, default: { user: {
      findMany: jest.fn(async ({ where }) => accountRows.filter(row => where.discordId.in.includes(row.discordId))),
    } } }));

    jest.doMock('../src/config/logger', () => ({
      __esModule: true,
      default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    }));
    jest.doMock('../src/config/redis', () => ({
      __esModule: true,
      getRedisClient: jest.fn().mockResolvedValue(fakeRedis),
    }));

    service = require('../src/services/onlinePresenceService');
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('Discord activity expires after 15 minutes and a new message restarts the window', async () => {
    const id = '123456789012345678';
    await service.noteDiscordMessageActivity(id);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(1);
    jest.setSystemTime(Date.now() + 14 * 60_000);
    await service.noteDiscordMessageActivity(id);
    jest.setSystemTime(Date.now() + 14 * 60_000);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(1);
    jest.setSystemTime(Date.now() + 60_000);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(0);
  });
  test('Discord and HUD/overlay deduplicate through the current linked account, including a merge', async () => {
    const discordId = '123456789012345678';
    await service.noteDiscordMessageActivity(discordId);
    accountRows = [{ id: 'canonical', discordId }];
    service.registerLocalPresenceSource(() => ['canonical', 'canonical']);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(1);
    accountRows = [{ id: 'merged', discordId }];
    service.registerLocalPresenceSource(() => ['merged']);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(1);
    service.registerLocalPresenceSource(() => []);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(1);
  });
  test('transient Redis failures preserve the last good total, never substitute local zero', async () => {
    fakeRedis._sets.set(`${service.ONLINE_USERS_KEY_PREFIX}remote`, new Set(['remote']));
    await expect(service.getGlobalOnlineCount()).resolves.toBe(1);
    fakeRedis.scanIterator = async function* () { throw new Error('offline'); };
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(1);
    jest.setSystemTime(Date.now() + 90_000);
    await expect(service.getGlobalOnlineCount(0)).rejects.toThrow('offline');
  });
  test('a valid empty snapshot becomes zero and invalid Discord IDs are ignored', async () => {
    await service.noteDiscordMessageActivity('not-an-id');
    await expect(service.getGlobalOnlineCount()).resolves.toBe(0);
  });

  test('deduplicates users across local sockets and backend instances', async () => {
    service.noteUserConnected('user-1');
    service.noteUserConnected('user-1');
    service.noteUserConnected('user-2');
    await service.flushLocalPresenceToRedis();

    fakeRedis._sets.set(`${service.ONLINE_USERS_KEY_PREFIX}other-instance`, new Set(['user-1', 'user-3']));

    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(3);
  });
  test('accepts the installed Redis client batched SCAN format', async () => {
    service.noteUserConnected('local-user');
    fakeRedis._sets.set(`${service.ONLINE_USERS_KEY_PREFIX}other`, new Set(['remote-user']));
    fakeRedis.scanIterator = async function* () { yield [...fakeRedis._sets.keys()]; };
    await expect(service.getGlobalOnlineCount()).resolves.toBe(2);
  });

  test('keeps a user counted during disconnect grace until the grace expires', async () => {
    service.noteUserConnected('user-9');

    expect(service.noteUserPendingDisconnect('user-9')).toBe(true);
    await service.flushLocalPresenceToRedis();
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(1);

    service.noteUserDisconnected('user-9');
    await service.flushLocalPresenceToRedis();
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(0);
  });

  test('uses the registered live provider as the source of truth (deduped)', async () => {
    // The WS layer registers a provider returning live socket userIds. A user
    // with multiple sockets must still count once.
    let live = ['user-a', 'user-a', 'user-b'];
    service.registerLocalPresenceSource(() => live);

    await service.flushLocalPresenceToRedis();
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(2);

    // Another instance reports an overlapping user — global stays deduped.
    fakeRedis._sets.set(`${service.ONLINE_USERS_KEY_PREFIX}other`, new Set(['user-b', 'user-c']));
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(3);

    // When the provider's set shrinks, the next flush reflects it exactly.
    live = ['user-b'];
    await service.flushLocalPresenceToRedis();
    fakeRedis._sets.delete(`${service.ONLINE_USERS_KEY_PREFIX}other`);
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(1);
  });

  test('unions HUD and overlay account IDs and tracks each transport independently', async () => {
    let overlay = ['shared', 'overlay-only'];
    let hud = ['shared', 'hud-only', 'hud-only'];
    service.registerLocalPresenceSource(() => overlay);
    service.registerLocalPresenceSource(() => hud, 'hud');
    expect(service.getLocalOnlineUserIds().sort()).toEqual(['hud-only', 'overlay-only', 'shared']);
    await expect(service.getGlobalOnlineCount()).resolves.toBe(3);
    overlay = [];
    await expect(service.getGlobalOnlineCount()).resolves.toBe(2);
    hud = [];
    await expect(service.getGlobalOnlineCount()).resolves.toBe(0);
  });

  test('unbalanced note*() calls cannot corrupt the count when a provider is registered', async () => {
    // Regression: the golden-build reject path fires noteUserDisconnected with no
    // matching noteUserConnected (flap loop). With the provider as source of
    // truth, these stray calls must NOT push the count negative or evict a user
    // who actually has a live socket.
    const live = ['real-user'];
    service.registerLocalPresenceSource(() => live);

    // Simulate a storm of unbalanced reject-path disconnect notes.
    for (let i = 0; i < 25; i++) service.noteUserDisconnected('flapper');
    service.noteUserDisconnected('real-user'); // stray decrement for a live user

    await service.flushLocalPresenceToRedis();
    // The live provider still reports 'real-user' → count is exactly 1.
    await expect(service.getGlobalOnlineCount(0)).resolves.toBe(1);
  });
});
