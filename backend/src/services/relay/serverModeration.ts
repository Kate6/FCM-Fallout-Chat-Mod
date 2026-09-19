import { getRedisClient } from '../../config/redis';
import { getServerHistory, type ServerRoomEvent } from './serverChat';
import type { ModerationRow, ModerationPage } from '../../websocket/serverModerationConnection';

const INDEX = 'relay:server-display:rooms';
const ACTIVITY = 'relay:server-display:activity';
const TTL = 7200; // exceeds retained history; refreshed by indexed message/history activity
const EXPIRED_MUTES = `local expired = {}
for i = 2, #ARGV do
  local activity = redis.call('ZSCORE', KEYS[1], ARGV[i])
  if not activity or tonumber(activity) <= tonumber(ARGV[1]) then
    table.insert(expired, 'server:' .. ARGV[i])
  end
end
return expired`;

/** Only called after staff/session authorization; bounded, atomic, read-only. */
export async function expiredModerationRooms(channelIds: string[]): Promise<string[]> {
  const redis = await getRedisClient();
  return await redis.eval(EXPIRED_MUTES, { keys: [ACTIVITY],
    arguments: [String(Date.now() - 3600_000), ...channelIds.map(id => id.slice('server:'.length))],
  }) as string[];
}
const ALLOCATE = `local id = redis.call('GET', KEYS[1])
if not id then id = tostring(redis.call('INCR', KEYS[2])) end
redis.call('SET', KEYS[1], id, 'EX', ARGV[1])
return id`;
const INDEX_ROOM = `redis.call('ZADD', KEYS[1], 0, ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
local stale = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[3], 'LIMIT', 0, 128)
for _, room in ipairs(stale) do redis.call('ZREM', KEYS[1], room); redis.call('ZREM', KEYS[2], room) end
return 1`;

export async function serverDisplayId(room: string): Promise<string> {
  const redis = await getRedisClient();
  return String(await redis.eval(ALLOCATE, {
    keys: [`relay:server-display:room:${room}`, 'relay:server-display:sequence'], arguments: [String(TTL)],
  }));
}
export async function noteModerationRoom(room: string): Promise<void> {
  const redis = await getRedisClient();
  await serverDisplayId(room);
  await redis.eval(INDEX_ROOM, { keys: [INDEX, ACTIVITY], arguments: [room, String(Date.now()), String(Date.now() - 3600_000)] });
}
export function moderationRow(room: string, displayId: string, e: ServerRoomEvent): ModerationRow | null {
  if (e.kind !== 'chat.message' || !e.linkedUserId || typeof e.messageId !== 'string'
    || typeof e.body !== 'string' || typeof e.createdAt !== 'string') return null;
  return { id: e.messageId, userId: e.linkedUserId, channelId: `server:${room}`, serverDisplayId: displayId,
    content: e.body, username: e.senderDisplayName, timestamp: e.createdAt, source: 'server',
    tag: e.tag, nameColor: e.nameColor, starColor: e.starColor, badges: e.supporterStar ? ['supporter'] : [] };
}
export async function moderationHistory(cursor: string | null = null): Promise<ModerationPage> {
  const redis = await getRedisClient();
  // Equal-score lexical keyset pagination: new message activity cannot reorder rooms.
  const rooms = await redis.zRange(INDEX, cursor ? `(${cursor}` : '-', '+', { BY: 'LEX', LIMIT: { offset: 0, count: 11 } });
  const rows: ModerationRow[] = [];
  // Serial, bounded I/O: do not fan out hundreds of simultaneous Redis requests.
  for (const room of rooms.slice(0, 10)) {
    const events = await getServerHistory(room, 0, 50);
    if (!events.length) continue;
    const id = await serverDisplayId(room);
    for (const event of events) { const row = moderationRow(room, id, event); if (row) rows.push(row); }
  }
  return { messages: rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp))),
    nextCursor: rooms.length > 10 ? rooms[9] : null };
}
