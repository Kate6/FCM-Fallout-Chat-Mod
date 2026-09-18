/**
 * worldRosterService.ts — roster-derived world rooms.
 *
 * The inspected HUD account data provides no unique world ID. The widget reports
 * HUD-visible player names; mutual sightings cluster linked relay users. Missing
 * HUD data can leave same-world users in separate rooms, so this remains inference.
 *
 * Redis relay:roster:<relayUserId> stores the account name, observed names, a
 * server-generated session UUID and the current HUD request ID, expiring in 120s.
 * Initial room keys use a root session UUID. Coordinated room affinity survives
 * peer departure, but not a new observation session, expiry or component split.
 */

import { getRedisClient } from '../../config/redis';
import logger from '../../config/logger';
import { randomUUID } from 'node:crypto';
import { copySplitRoomHistory } from './serverChat';

const KEY_PREFIX = 'relay:roster:';
const TTL_SECONDS = 120;
const MAX_NAMES = 24;
const MAX_NAME_LENGTH = 64;
const MAX_ACTIVE_ROSTERS = 500;

export interface RosterEntry {
  userId: string;
  name: string; // own public account name (lowercased)
  seen: string[]; // observed HUD player names (lowercased)
  session: string;
  requestId: string;
  /** Last coordinated room for this observation session; never client-supplied. */
  roomKey?: string;
  /** Desktop exports expire at the original observation deadline, not heartbeat. */
  expiresAt?: number;
}

export function normalizeRosterName(name: string): string { return name.trim().toLowerCase().slice(0, MAX_NAME_LENGTH); }

export async function setRoster(relayUserId: string, ownName: string, seenNames: string[], requestId = '', expiresAt?: number): Promise<void> {
  try {
    const redis = await getRedisClient();
    const seen = [...new Set(seenNames
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0 && n.length <= MAX_NAME_LENGTH))]
      .slice(0, MAX_NAMES);
    const name = normalizeRosterName(ownName || '');
    const previous = await readRoster(relayUserId);
    const session = previous && previous.requestId === requestId ? previous.session : randomUUID();
    const roomKey = previous?.session === session ? previous.roomKey : undefined;
    const value = JSON.stringify({ name, seen, session, requestId, ...(roomKey ? { roomKey } : {}), ...(expiresAt === undefined ? {} : { expiresAt }) });
    await redis.set(`${KEY_PREFIX}${relayUserId}`, value, expiresAt === undefined
      ? { EX: TTL_SECONDS } : { PX: Math.max(1, Math.ceil(expiresAt - Date.now())) });
  } catch (err) {
    logger.warn({ err, relayUserId }, '[worldRoster] setRoster failed');
    throw err;
  }
}

export async function clearRoster(relayUserId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`${KEY_PREFIX}${relayUserId}`);
  } catch (err) {
    logger.warn({ err, relayUserId }, '[worldRoster] clearRoster failed');
    throw err;
  }
}

export async function readRoster(userId: string): Promise<RosterEntry | null> {
  const redis = await getRedisClient();
  const raw = await redis.get(`${KEY_PREFIX}${userId}`);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!isRosterPayload(value)) return null;
  if (value.expiresAt !== undefined && value.expiresAt <= Date.now()) return null;
  return { userId, ...value };
}

/** All live rosters (TTL-pruned by Redis). */
async function getAllRosters(): Promise<RosterEntry[]> {
  const redis = await getRedisClient();
  const keys: string[] = [];
  for await (const scanResult of redis.scanIterator({ MATCH: `${KEY_PREFIX}*`, COUNT: 100 })) {
    for (const key of scanKeys(scanResult)) {
      if (keys.length >= MAX_ACTIVE_ROSTERS) {
        logger.warn({ maxActiveRosters: MAX_ACTIVE_ROSTERS }, '[worldRoster] roster scan capped');
        break;
      }
      keys.push(key);
    }
    if (keys.length >= MAX_ACTIVE_ROSTERS) break;
  }

  const entries = await Promise.all(keys.map(async (key): Promise<RosterEntry | null> => {
    try {
      const raw = await redis.get(key);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRosterPayload(parsed)) return null;
      if (parsed.expiresAt !== undefined && parsed.expiresAt <= Date.now()) return null;
      return { userId: key.slice(KEY_PREFIX.length), ...parsed };
    } catch {
      return null;
    }
  }));
  return entries.filter((entry): entry is RosterEntry => entry !== null);
}

function scanKeys(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

function isRosterPayload(value: unknown): value is Omit<RosterEntry, 'userId'> {
  if (!value || typeof value !== 'object' || !('name' in value) || !('seen' in value)) return false;
  return typeof value.name === 'string'
    && 'session' in value && typeof value.session === 'string' && value.session.length > 0
    && 'requestId' in value && typeof value.requestId === 'string'
    && (!('roomKey' in value) || (typeof value.roomKey === 'string' && /^r:[0-9a-f-]{36}$/.test(value.roomKey)))
    && (!('expiresAt' in value) || (typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)))
    && Array.isArray(value.seen)
    && value.seen.every((name) => typeof name === 'string');
}

/**
 * Cluster users into rooms by sighting edges (union-find) and return each user's
 * roomKey. A user with no edges gets a solo room keyed on their session UUID —
 * server chat still works when alone on a world.
 */
export async function computeRooms(assertCurrent: () => Promise<void> = async () => {}): Promise<Map<string, string>> {
  const startedAt = Date.now();
  const rosters = await getAllRosters();
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const r of rosters) parent.set(r.userId, r.userId);

  // Require mutual sightings. A single client can lie about its outgoing
  // roster, so one-sided edges are not enough to merge two private rooms.
  // Index owners by public account name to keep this O(N * MAX_NAMES) instead of
  // comparing every roster pair.
  const byName = new Map<string, RosterEntry[]>();
  for (const roster of rosters) {
    if (!roster.name) continue;
    const owners = byName.get(roster.name) ?? [];
    owners.push(roster);
    byName.set(roster.name, owners);
  }
  for (const a of rosters) {
    for (const seenName of a.seen) {
      for (const b of byName.get(seenName) ?? []) {
        if (a.userId === b.userId || !b.seen.includes(a.name)) continue;
        union(a.userId, b.userId);
      }
    }
  }

  const groups = new Map<string, RosterEntry[]>();
  for (const roster of rosters) {
    const root = find(roster.userId);
    groups.set(root, [...(groups.get(root) ?? []), roster]);
  }
  // An old room may continue only in ONE connected component. A split must not
  // give disconnected worlds shared history or publication authority.
  const owners = new Map<string, Set<string>>();
  for (const [root, members] of groups) for (const member of members) {
    if (!member.roomKey) continue;
    const roots = owners.get(member.roomKey) ?? new Set<string>();
    roots.add(root); owners.set(member.roomKey, roots);
  }
  const rooms = new Map<string, string>();
  const redis = await getRedisClient();
  for (const [root, members] of groups) {
    const candidates = [...new Set(members.map(m => m.roomKey).filter((key): key is string => !!key))]
      .filter(key => owners.get(key)?.size === 1).sort();
    const initial = `r:${members.find(m => m.userId === root)!.session}`;
    // Never resurrect a split room through its original root session UUID.
    const roomKey = candidates[0] ?? (members.some(m => m.roomKey) ? `r:${randomUUID()}` : initial);
    // A disappearing sighting can precede a peer's leave. Isolate live delivery
    // immediately, but retain the history these unchanged sessions could already
    // read. Never seed a mixed group/new generation/new member from another room.
    const prior = members[0]?.roomKey;
    if (!candidates.length && prior && owners.get(prior)!.size > 1
      && members.every(member => member.roomKey === prior)) {
      await assertCurrent();
      await copySplitRoomHistory(prior, roomKey);
    }
    for (const member of members) {
      rooms.set(member.userId, roomKey);
      if (member.roomKey === roomKey) continue;
      const { userId, ...payload } = member;
      // Caller holds the shared coordinator lock. XX/KEEPTTL cannot recreate an
      // expired observation or turn a heartbeat into fresh roster evidence.
      await assertCurrent();
      await redis.set(`${KEY_PREFIX}${userId}`, JSON.stringify({ ...payload, roomKey }), { XX: true, KEEPTTL: true });
    }
  }
  logger.debug({ rosterCount: rosters.length, elapsedMs: Date.now() - startedAt }, '[worldRoster] rooms recomputed');
  return rooms;
}
