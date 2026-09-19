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
 * peer departure. A recovering native HUD replacement cannot erase fresh graph
 * evidence with its startup-empty snapshot; ordinary new observation sessions,
 * expiry and component splits discard affinity.
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
  /** HUD-observed self names used only as room-membership evidence, never auth/display identity. */
  aliases?: string[];
  seen: string[]; // observed HUD player names (lowercased)
  session: string;
  requestId: string;
  /** Last coordinated room for this observation session; never client-supplied. */
  roomKey?: string;
  /** Server-owned start of this observation session; never renewed by updates. */
  sessionStartedAt?: number;
  /** Desktop exports expire at the original observation deadline, not heartbeat. */
  expiresAt?: number;
}

interface SetRosterOptions {
  /** Authenticated history-recovery marker accompanies this HUD replacement. */
  preserveExistingSession?: boolean;
  /** Apply native HUDMenu reconstruction safeguards; desktop exports use generations instead. */
  recoverHudReplacement?: boolean;
}

export function normalizeRosterName(name: string): string { return name.trim().toLowerCase().slice(0, MAX_NAME_LENGTH); }

export async function setRoster(relayUserId: string, ownName: string, seenNames: string[], requestId = '', expiresAt?: number,
  ownAliases: string[] = [], options: SetRosterOptions = {}): Promise<boolean> {
  try {
    const redis = await getRedisClient();
    const seen = [...new Set(seenNames
      .map((n) => n.trim().toLowerCase())
      .filter((n) => n.length > 0 && n.length <= MAX_NAME_LENGTH))]
      .slice(0, MAX_NAMES);
    const name = normalizeRosterName(ownName || '');
    const aliases = [...new Set(ownAliases.map(normalizeRosterName)
      .filter(alias => alias.length > 0 && alias !== name))].slice(0, 4);
    const previous = await readRoster(relayUserId);
    const replacement = previous !== null && previous.requestId !== requestId;
    // HUDMenu is reconstructed after raid stages and score screens. Its first
    // MapMenuData snapshot is commonly empty even though Fallout has not changed
    // worlds. Do not let that absence of evidence delete a fresh mutual-sighting
    // graph. Returning without a write also preserves the original Redis TTL, so
    // an indefinitely blank replacement cannot keep stale membership alive.
    if (options.recoverHudReplacement && replacement && seen.length === 0 && previous.seen.length > 0) return false;
    const overlapsPrevious = options.recoverHudReplacement && replacement && seen.length > 0
      && seen.some(seenName => previous.seen.includes(seenName));
    // A replacement HUD MovieRoot deliberately rotates its request nonce. That
    // nonce still fences delivery, but it is not evidence that Fallout changed
    // worlds. Preserve backend-owned affinity only when authenticated RESYNC or
    // overlapping roster evidence establishes continuity; ordinary nonce changes
    // remain a fail-closed new observation session.
    const continuingSession = previous !== null
      && (previous.requestId === requestId || options.preserveExistingSession || overlapsPrevious);
    const session = continuingSession ? previous.session : randomUUID();
    const roomKey = previous?.session === session ? previous.roomKey : undefined;
    // Missing age belongs to a pre-upgrade active session, older than new ones.
    const sessionStartedAt = previous?.session === session ? previous.sessionStartedAt ?? 0 : Date.now();
    const value = JSON.stringify({ name, aliases, seen, session, requestId, sessionStartedAt,
      ...(roomKey ? { roomKey } : {}), ...(expiresAt === undefined ? {} : { expiresAt }) });
    await redis.set(`${KEY_PREFIX}${relayUserId}`, value, expiresAt === undefined
      ? { EX: TTL_SECONDS } : { PX: Math.max(1, Math.ceil(expiresAt - Date.now())) });
    return true;
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
    && (!('sessionStartedAt' in value) || (typeof value.sessionStartedAt === 'number'
      && Number.isSafeInteger(value.sessionStartedAt) && value.sessionStartedAt >= 0))
    && (!('expiresAt' in value) || (typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)))
    && (!('aliases' in value) || (Array.isArray(value.aliases) && value.aliases.length <= 4
      && value.aliases.every(alias => typeof alias === 'string' && alias.length > 0 && alias.length <= MAX_NAME_LENGTH)))
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
  const identityNames = (roster: RosterEntry): string[] => [...new Set([roster.name, ...(roster.aliases ?? [])].filter(Boolean))];
  const byName = new Map<string, RosterEntry[]>();
  for (const roster of rosters) {
    for (const identityName of identityNames(roster)) {
      const owners = byName.get(identityName) ?? [];
      owners.push(roster);
      byName.set(identityName, owners);
    }
  }
  for (const a of rosters) {
    for (const seenName of a.seen) {
      for (const b of byName.get(seenName) ?? []) {
        if (a.userId === b.userId || !identityNames(a).some(name => b.seen.includes(name))) continue;
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
    // Keep the oldest continuously present session's eligible room when mutual
    // discovery joins components. A returning user's provisional UUID must not
    // displace the survivor merely by sorting first. No histories are merged.
    const ages = new Map<string, number>();
    for (const member of members) if (member.roomKey) {
      ages.set(member.roomKey, Math.min(ages.get(member.roomKey) ?? Infinity, member.sessionStartedAt ?? 0));
    }
    const candidates = [...new Set(members.map(m => m.roomKey).filter((key): key is string => !!key))]
      .filter(key => owners.get(key)?.size === 1)
      .sort((a, b) => ages.get(a)! - ages.get(b)! || a.localeCompare(b));
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
