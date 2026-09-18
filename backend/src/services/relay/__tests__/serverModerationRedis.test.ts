import { test } from 'node:test';
import assert from 'node:assert/strict';

// Opt-in against an isolated disposable Redis ONLY. No production key deletion.
test('atomic numeric labels survive concurrent instances and retained history is bounded',
  { skip: process.env.FCM_MODERATION_REDIS_TEST !== '1' }, async () => {
    const { getRedisClient } = await import('../../../config/redis.js');
    const { serverDisplayId, moderationHistory, noteModerationRoom, expiredModerationRooms } = await import('../serverModeration.js');
    const { publishServerMessage } = await import('../serverChat.js');
    const redis = await getRedisClient();
    try {
      const ids = await Promise.all(Array.from({ length: 20 }, () => serverDisplayId('test-a')));
      assert.equal(new Set(ids).size, 1);
      assert.match(ids[0], /^\d+$/);
      assert.notEqual(await serverDisplayId('test-b'), ids[0]);
      await redis.expire('relay:server-display:room:test-a', 10);
      assert.equal(await serverDisplayId('test-a'), ids[0]);
      assert.ok(await redis.ttl('relay:server-display:room:test-a') > 3600);
      for (let i = 1; i <= 55; i++) {
        await publishServerMessage('test-a', i, { id: i, kind: 'chat.message', messageId: `server:test-a:${i}`,
          channel: 'server', senderUserId: 'private-native-identity', linkedUserId: 'account',
          senderDisplayName: 'Name', body: `message ${i}`, targetUserId: '', createdAt: new Date(i * 1000).toISOString() });
      }
      const { messages: rows } = await moderationHistory();
      assert.equal(rows.length, 50);
      assert.equal(rows[0].id, 'server:test-a:6');
      assert.ok(rows.every(row => row.serverDisplayId === ids[0] && row.channelId === 'server:test-a'));
      assert.ok(rows.every(row => !('senderUserId' in row)));
      await redis.pExpire('relay:server-display:room:test-a', 1);
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.notEqual(await serverDisplayId('test-a'), ids[0]);
      for (let i = 0; i < 22; i++) {
        const room = `test-page-${String(i).padStart(2, '0')}`;
        await publishServerMessage(room, 1, { id: 1, kind: 'chat.message', messageId: `server:${room}:1`,
          channel: 'server', senderUserId: 'native', linkedUserId: 'account', senderDisplayName: 'N',
          body: 'history', targetUserId: '', createdAt: new Date().toISOString() });
      }
      const found = new Set<string>(); let cursor: string | null = null;
      do {
        const page = await moderationHistory(cursor);
        assert.ok(page.messages.length <= 500);
        for (const message of page.messages) found.add(message.channelId);
        cursor = page.nextCursor;
        // Touch rooms during traversal: activity must never reorder the keyset.
        await noteModerationRoom('test-page-21');
        await noteModerationRoom('test-page-00');
      } while (cursor);
      assert.equal(found.size, 23);
      await noteModerationRoom('r:quiet');
      await redis.zAdd('relay:server-display:activity', { value: 'r:expired', score: Date.now() - 3600_001 });
      assert.deepEqual(await expiredModerationRooms(['server:r:quiet', 'server:r:expired', 'server:r:missing']), ['server:r:expired', 'server:r:missing']);
    } finally { await redis.quit(); }
  });
