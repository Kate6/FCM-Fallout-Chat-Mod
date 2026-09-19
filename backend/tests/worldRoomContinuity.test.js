const values = new Map();
const redis = {
  get: jest.fn(async key => values.get(key) ?? null),
  set: jest.fn(async (key, value, options = {}) => {
    if (options.XX && !values.has(key)) return null;
    values.set(key, value); return 'OK';
  }),
  del: jest.fn(async key => values.delete(key)),
  copy: jest.fn(async () => false),
  scanIterator: async function* () { yield [...values.keys()]; },
};
jest.mock('../src/config/redis', () => ({ getRedisClient: async () => redis }));
jest.mock('../src/config/logger', () => ({ __esModule: true, default: { warn: jest.fn(), debug: jest.fn() } }));
const { setRoster, clearRoster, computeRooms, readRoster } = require('../src/services/relay/worldRosterService');
beforeEach(() => { values.clear(); jest.clearAllMocks(); });

test.each([false, true])('rejoin keeps the continuously occupied room regardless of UUID order (reverse=%s)', async reverse => {
  const low = 'r:00000000-0000-4000-8000-000000000001';
  const high = 'r:ffffffff-ffff-4fff-8fff-ffffffffffff';
  const survivor = reverse ? low : high, returning = reverse ? high : low;
  values.set('relay:roster:laptop', JSON.stringify({ name: 'alice', seen: ['bob'], session: 'stay', requestId: 'stay', roomKey: survivor, sessionStartedAt: 1000 }));
  values.set('relay:roster:desktop', JSON.stringify({ name: 'bob', seen: ['alice'], session: 'return', requestId: 'return', roomKey: returning, sessionStartedAt: 2000 }));
  const rooms = await computeRooms();
  expect(rooms.get('laptop')).toBe(survivor);
  expect(rooms.get('desktop')).toBe(survivor);
  expect(redis.copy).not.toHaveBeenCalled();
});

test('session age survives observations but resets on generation change', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    await setRoster('a', 'Alice', [], 'one');
    clock.mockReturnValue(2000);
    await setRoster('a', 'Alice', ['Bob'], 'one');
    expect((await readRoster('a')).sessionStartedAt).toBe(1000);
    await setRoster('a', 'Alice', [], 'two');
    expect((await readRoster('a')).sessionStartedAt).toBe(2000);
    await clearRoster('a');
    clock.mockReturnValue(3000);
    await setRoster('a', 'Alice', [], 'two');
    expect((await readRoster('a')).sessionStartedAt).toBe(3000);
  } finally { clock.mockRestore(); }
});

test('a verified HUD reload may rotate its request nonce without rotating room affinity', async () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    await setRoster('a', 'Alice', ['Bob'], 'first');
    const first = await computeRooms();
    const before = await readRoster('a');
    clock.mockReturnValue(2000);
    await setRoster('a', 'Alice', ['Bob'], 'replacement', undefined, [], { preserveExistingSession: true });
    const after = await readRoster('a');
    expect(after).toMatchObject({ requestId: 'replacement', session: before.session,
      roomKey: first.get('a'), sessionStartedAt: 1000 });
    expect((await computeRooms()).get('a')).toBe(first.get('a'));
  } finally { clock.mockRestore(); }
});

test('verified HUD reloads preserve a continuously connected multi-user room', async () => {
  const users = ['alice', 'bob', 'carol', 'dave', 'erin'];
  for (const user of users) {
    await setRoster(user, user, users.filter(peer => peer !== user), `first-${user}`);
  }
  const before = await computeRooms();
  const room = before.get('alice');
  expect(new Set(before.values())).toEqual(new Set([room]));

  // A UI reload can reconstruct every active widget without anyone leaving the
  // Fallout server. Each verified replacement nonce must retain the component.
  for (const user of users) {
    await setRoster(user, user, users.filter(peer => peer !== user), `reload-${user}`, undefined, [],
      { preserveExistingSession: true });
    expect(new Set((await computeRooms()).values())).toEqual(new Set([room]));
  }
});

test('a replacement HUD cannot erase fresh roster evidence before its data sources recover', async () => {
  await setRoster('a', 'Alice', ['Bob', 'Carol'], 'first-a');
  await setRoster('b', 'Bob', ['Alice', 'Carol'], 'first-b');
  await setRoster('c', 'Carol', ['Alice', 'Bob'], 'first-c');
  const room = (await computeRooms()).get('a');
  const before = await readRoster('a');

  // A reconstructed HUDMenu initially reports an empty MapMenuData snapshot. The
  // backend must leave its fresh evidence and TTL untouched and wait for recovery.
  await expect(setRoster('a', 'Alice', [], 'reload-a', undefined, [],
    { recoverHudReplacement: true })).resolves.toBe(false);
  expect(await readRoster('a')).toEqual(before);
  expect(new Set((await computeRooms()).values())).toEqual(new Set([room]));

  // Once the replacement sees any prior peer, the existing roster-overlap
  // heuristic proves continuity and the delivery nonce may rotate safely.
  await expect(setRoster('a', 'Alice', ['Bob'], 'reload-a', undefined, [],
    { recoverHudReplacement: true })).resolves.toBe(true);
  expect(await readRoster('a')).toMatchObject({ requestId: 'reload-a', session: before.session,
    roomKey: room, sessionStartedAt: before.sessionStartedAt });
  expect(new Set((await computeRooms()).values())).toEqual(new Set([room]));
});

test('simultaneous empty snapshots from reconstructed HUDs leave the whole room intact', async () => {
  const users = ['alice', 'bob', 'carol', 'dave', 'erin'];
  for (const user of users) await setRoster(user, user, users.filter(peer => peer !== user), `first-${user}`);
  const room = (await computeRooms()).get('alice');
  const before = new Map(await Promise.all(users.map(async user => [user, await readRoster(user)])));

  for (const user of users) {
    await expect(setRoster(user, user, [], `reload-${user}`, undefined, [],
      { recoverHudReplacement: true })).resolves.toBe(false);
    expect(await readRoster(user)).toEqual(before.get(user));
    expect(new Set((await computeRooms()).values())).toEqual(new Set([room]));
  }
});

test('a disjoint replacement roster remains a new world generation', async () => {
  await setRoster('a', 'Alice', ['Bob'], 'first');
  const oldRoom = (await computeRooms()).get('a');
  const oldSession = (await readRoster('a')).session;
  await expect(setRoster('a', 'Alice', ['Carol'], 'replacement', undefined, [],
    { recoverHudReplacement: true })).resolves.toBe(true);
  expect((await readRoster('a')).session).not.toBe(oldSession);
  expect((await computeRooms()).get('a')).not.toBe(oldRoom);
});

test('pre-upgrade active sessions retain priority without resetting their age', async () => {
  const room = 'r:ffffffff-ffff-4fff-8fff-ffffffffffff';
  values.set('relay:roster:a', JSON.stringify({ name: 'alice', seen: [], session: 'old', requestId: 'old', roomKey: room }));
  await setRoster('a', 'Alice', ['Bob'], 'old');
  expect((await readRoster('a')).sessionStartedAt).toBe(0);
  await setRoster('b', 'Bob', [], 'new');
  await computeRooms();
  await setRoster('b', 'Bob', ['Alice'], 'new');
  expect((await computeRooms()).get('b')).toBe(room);
});

test.each([-1, 1.5, 'old'])('invalid persisted session age is rejected: %s', async sessionStartedAt => {
  values.set('relay:roster:a', JSON.stringify({ name: 'alice', seen: [], session: 'old', requestId: 'old', sessionStartedAt }));
  expect(await readRoster('a')).toBeNull();
  expect((await computeRooms()).size).toBe(0);
});

test('equal-age candidates use deterministic UUID order independent of scan order', async () => {
  for (const id of ['b', 'a']) values.set(`relay:roster:${id}`, JSON.stringify({ name: id, seen: [id === 'a' ? 'b' : 'a'],
    session: id, requestId: id, sessionStartedAt: 1000, roomKey: `r:${id.repeat(8)}-0000-4000-8000-000000000001` }));
  expect((await computeRooms()).get('b')).toBe('r:aaaaaaaa-0000-4000-8000-000000000001');
});

test.each(['a', 'b'])('survivor keeps the canonical history key when %s leaves', async departing => {
  await setRoster('a', 'Alice', ['Bob'], 'world-a');
  await setRoster('b', 'Bob', ['Alice'], 'world-b');
  const before = await computeRooms();
  expect(before.get('a')).toBe(before.get('b'));
  await clearRoster(departing);
  const survivor = departing === 'a' ? 'b' : 'a';
  await setRoster(survivor, survivor === 'a' ? 'Alice' : 'Bob', [], `world-${survivor}`);
  expect((await computeRooms()).get(survivor)).toBe(before.get(survivor));
  expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), { XX: true, KEEPTTL: true });
});
test('disconnected components cannot keep sharing the old room', async () => {
  await setRoster('a', 'Alice', ['Bob'], 'a'); await setRoster('b', 'Bob', ['Alice'], 'b');
  const old = (await computeRooms()).get('a');
  await setRoster('a', 'Alice', [], 'a'); await setRoster('b', 'Bob', [], 'b');
  const rooms = await computeRooms();
  expect(rooms.get('a')).not.toBe(rooms.get('b'));
  expect(rooms.get('a')).not.toBe(old); expect(rooms.get('b')).not.toBe(old);
});
test('roster-only self aliases bridge account-name differences without weakening mutual sighting', async () => {
  await setRoster('a', 'AccountAlice', ['VisibleBob'], 'a', undefined, ['VisibleAlice']);
  await setRoster('b', 'AccountBob', ['VisibleAlice'], 'b', undefined, ['VisibleBob']);
  const rooms = await computeRooms();
  expect(rooms.get('a')).toBe(rooms.get('b'));

  await setRoster('b', 'AccountBob', ['SomeoneElse'], 'b', undefined, ['VisibleBob']);
  const separated = await computeRooms();
  expect(separated.get('a')).not.toBe(separated.get('b'));
});
test('world generation change and leave/rejoin do not inherit old history', async () => {
  await setRoster('a', 'Alice', [], 'old'); const old = (await computeRooms()).get('a');
  await setRoster('a', 'Alice', [], 'new');
  expect((await readRoster('a')).roomKey).toBeUndefined();
  expect((await computeRooms()).get('a')).not.toBe(old);
  await clearRoster('a'); await setRoster('a', 'Alice', [], 'new');
  expect((await readRoster('a')).roomKey).toBeUndefined();
  expect(redis.copy).not.toHaveBeenCalled();
});

test('split history is not granted to a newly joined member', async () => {
  await setRoster('a', 'Alice', ['Bob'], 'a');
  await setRoster('b', 'Bob', ['Alice'], 'b');
  const old = (await computeRooms()).get('a');
  await setRoster('a', 'Alice', ['Charlie'], 'a');
  await setRoster('c', 'Charlie', ['Alice'], 'c');
  const rooms = await computeRooms();
  expect(rooms.get('a')).toBe(rooms.get('c'));
  expect(rooms.get('a')).not.toBe(rooms.get('b'));
  expect(redis.copy).not.toHaveBeenCalledWith(`relay:serverchat:${old}`, `relay:serverchat:${rooms.get('a')}`);
  expect(redis.copy).toHaveBeenCalledWith(`relay:serverchat:${old}`, `relay:serverchat:${rooms.get('b')}`);
});

test('history storage failure aborts a split before changing room affinity', async () => {
  await setRoster('a', 'Alice', ['Bob'], 'a');
  await setRoster('b', 'Bob', ['Alice'], 'b');
  const old = (await computeRooms()).get('a');
  await setRoster('a', 'Alice', [], 'a');
  redis.copy.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(computeRooms()).rejects.toThrow('storage unavailable');
  expect((await readRoster('a')).roomKey).toBe(old);
  expect((await readRoster('b')).roomKey).toBe(old);
});
