jest.mock('../src/config/database', () => ({ query: jest.fn(async sql => ({ rows: sql.includes('WITH') ? [] : [{ total: 1 }] })) }));
jest.mock('../src/services/onlinePresenceService', () => ({ getGlobalOnlineCount: jest.fn(async () => 23) }));
const { getGlobalOnlineCount } = require('../src/services/onlinePresenceService');
const { getPublicStats, invalidatePublicStatsCache } = require('../src/services/publicStatsService');
test('website uses the same aggregate presence count and cached public result', async () => {
  invalidatePublicStatsCache();
  expect((await getPublicStats()).onlineNow).toBe(23);
  await getPublicStats(); expect(getGlobalOnlineCount).toHaveBeenCalledTimes(1);
  invalidatePublicStatsCache(); getGlobalOnlineCount.mockResolvedValueOnce(0);
  expect((await getPublicStats()).onlineNow).toBe(0);
});
