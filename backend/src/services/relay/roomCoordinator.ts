import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getRedisClient } from '../../config/redis';
import { INSTANCE_ID } from '../../config/instanceIdentity';
import { clearRoster, computeRooms, readRoster, setRoster } from './worldRosterService';
import { clearWorldId, getWorldId, setWorldId } from './worldIdService';
import { publishRebind } from './serverChat';

interface NativeRoomHooks {
  consumeResync(userId: string): boolean;
  clearResync(userId: string): void;
  rebind(userId: string, room: string | null): void;
  backfill(userId: string, room: string, requestId: string): Promise<void>;
}
let nativeHooks: NativeRoomHooks | undefined;
export function registerNativeRoomHooks(hooks: NativeRoomHooks): void { nativeHooks = hooks; }

const LOCK_KEY = 'relay:room-coordination';
const LOCK_MS = 30_000;
const RELEASE_LOCK = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";

/** Native and desktop mutations share a Redis lock, including socket ownership
 * changes. An old socket cannot clear a newer socket's actor on another replica. */
export async function coordinateRooms<T>(work: (assertCurrent: () => Promise<void>) => Promise<T>): Promise<T> {
  const redis = await getRedisClient();
  const owner = randomUUID();
  const deadline = Date.now() + 2_000;
  while (await redis.set(LOCK_KEY, owner, { NX: true, PX: LOCK_MS }) !== 'OK') {
    if (Date.now() >= deadline) throw new Error('Room coordination busy');
    await delay(20);
  }
  const assertCurrent = async (): Promise<void> => {
    if (await redis.get(LOCK_KEY) !== owner) throw new Error('Room coordination expired');
  };
  try { return await work(assertCurrent); }
  finally { await redis.eval(RELEASE_LOCK, { keys: [LOCK_KEY], arguments: [owner] }); }
}

/** Caller holds coordinateRooms. This is the single room assignment path for
 * both transports; native subscriber replay retains its existing resync barrier. */
export async function applyRoomAssignments(requester: string, assertCurrent: () => Promise<void>): Promise<void> {
  const rooms = await computeRooms(assertCurrent);
  if (requester && !rooms.has(requester)) throw new Error('Current roster could not be assigned');
  for (const [userId, roomKey] of rooms) {
    const roster = await readRoster(userId);
    if (!roster) continue;
    const current = await getWorldId(userId);
    const shouldBackfillResync = nativeHooks?.consumeResync(userId) ?? false;
    await assertCurrent();
    await setWorldId(userId, roomKey, roster.expiresAt);
    const requestId = roster.requestId;
    if (current === roomKey && !shouldBackfillResync && !(userId === requester && requestId)) continue;
    nativeHooks?.rebind(userId, roomKey);
    await publishRebind(userId, roomKey, requestId, INSTANCE_ID);
    await nativeHooks?.backfill(userId, roomKey, requestId);
  }
}

/** Caller holds coordinateRooms; authority/nonce checks happen before this call. */
export async function clearRoomMembership(userId: string, assertCurrent: () => Promise<void>): Promise<void> {
  await assertCurrent();
  nativeHooks?.clearResync(userId);
  await clearWorldId(userId);
  await clearRoster(userId);
  nativeHooks?.rebind(userId, null);
  await publishRebind(userId, null, undefined, INSTANCE_ID);
}

export async function observeNativeRoster(userId: string, ownName: string, names: string[], requestId: string): Promise<void> {
  await coordinateRooms(async assertCurrent => {
    await setRoster(userId, ownName, names, requestId);
    await applyRoomAssignments(userId, assertCurrent);
  });
}
