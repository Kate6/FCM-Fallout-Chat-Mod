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
