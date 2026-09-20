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
 * expiry and detached split components discard affinity.
 */

import { getRedisClient } from '../../config/redis';
import logger from '../../config/logger';
import { createHash, randomUUID } from 'node:crypto';
import { copySplitRoomHistory } from './serverChat';
import { opaqueRef, recordRoomDiagnostic, rosterNameRef } from './roomDiagnostics';

const KEY_PREFIX = 'relay:roster:';
const TTL_SECONDS = 120;
const MAX_NAMES = 24;
const MAX_NAME_LENGTH = 64;
const MAX_ACTIVE_ROSTERS = 500;
const MISSING_SIGHTING_GRACE_MS = 10_000;

interface GraceSighting {
  name: string;
  until: number;
}

export interface RosterEntry {
  userId: string;
  name: string; // own public account name (lowercased)
  /** HUD-observed self names used only as room-membership evidence, never auth/display identity. */
  aliases?: string[];
  seen: string[]; // observed HUD player names (lowercased)
  /** Removed sightings retained briefly without renewal to absorb incomplete UI snapshots. */
  graceSeen?: GraceSighting[];
  session: string;
  requestId: string;
  /** Bounded transport class for privacy-safe room-decision diagnostics. */
  observationSource?: string;
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
  /** Fixed server-selected transport label; never a player-controlled identifier. */
  observationSource?: 'native' | 'bridge:zfe' | 'bridge:xscal';
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
    if (options.recoverHudReplacement && replacement && seen.length === 0 && previous.seen.length > 0) {
      await recordRoomDiagnostic(relayUserId, {
        event: 'roster_recovery_held', source: options.observationSource ?? previous.observationSource ?? 'legacy',
        requestRef: opaqueRef(requestId), previousRequestRef: opaqueRef(previous.requestId),
        previousRosterCount: previous.seen.length, previousRoomRef: previous.roomKey ? opaqueRef(previous.roomKey) : null,
      });
      return false;
    }
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
    const now = Date.now();
    const graceByName = new Map<string, number>();
    if (continuingSession && previous) {
      for (const grace of previous.graceSeen ?? []) {
        if (grace.until > now && !seen.includes(grace.name)) graceByName.set(grace.name, grace.until);
      }
      for (const priorName of seen.length > 0 ? previous.seen : []) {
        if (!seen.includes(priorName) && !graceByName.has(priorName)) {
          graceByName.set(priorName, now + MISSING_SIGHTING_GRACE_MS);
        }
      }
    }
    const graceSeen = [...graceByName].map(([graceName, until]) => ({ name: graceName, until })).slice(0, MAX_NAMES);
    const observationSource = options.observationSource ?? previous?.observationSource;
    const value = JSON.stringify({ name, aliases, seen, ...(graceSeen.length ? { graceSeen } : {}), session, requestId, sessionStartedAt,
      ...(observationSource ? { observationSource } : {}),
      ...(roomKey ? { roomKey } : {}), ...(expiresAt === undefined ? {} : { expiresAt }) });
    await redis.set(`${KEY_PREFIX}${relayUserId}`, value, expiresAt === undefined
      ? { EX: TTL_SECONDS } : { PX: Math.max(1, Math.ceil(expiresAt - Date.now())) });
    const changed = !previous || previous.requestId !== requestId || previous.session !== session
      || previous.observationSource !== observationSource
      || previous.seen.join('\u001f') !== seen.join('\u001f')
      || (previous.aliases ?? []).join('\u001f') !== aliases.join('\u001f')
      || (previous.graceSeen ?? []).map(grace => grace.name).sort().join('\u001f')
        !== graceSeen.map(grace => grace.name).sort().join('\u001f');
    if (changed) await recordRoomDiagnostic(relayUserId, {
      event: 'roster_observed', source: observationSource ?? 'legacy',
      continuity: continuingSession ? 'continued' : 'new_session', replacement,
      requestRef: opaqueRef(requestId), sessionRef: opaqueRef(session),
      roomRef: roomKey ? opaqueRef(roomKey) : null,
      rosterCount: seen.length, rosterRefs: seen.map(rosterNameRef).sort(),
      aliasCount: aliases.length, aliasRefs: aliases.map(rosterNameRef).sort(),
      graceCount: graceSeen.length, graceRefs: graceSeen.map(grace => rosterNameRef(grace.name)).sort(),
    });
    return true;
  } catch (err) {
    logger.warn({ err, relayUserId }, '[worldRoster] setRoster failed');
    throw err;
  }
}

export async function clearRoster(relayUserId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    const previous = await readRoster(relayUserId);
    await redis.del(`${KEY_PREFIX}${relayUserId}`);
    await recordRoomDiagnostic(relayUserId, {
      event: 'roster_cleared', previousRoomRef: previous?.roomKey ? opaqueRef(previous.roomKey) : null,
      previousSessionRef: previous?.session ? opaqueRef(previous.session) : null,
      previousRosterCount: previous?.seen.length ?? 0,
    });
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
    && (!('observationSource' in value) || (typeof value.observationSource === 'string'
      && ['native', 'bridge:zfe', 'bridge:xscal'].includes(value.observationSource)))
    && (!('roomKey' in value) || (typeof value.roomKey === 'string' && /^r:[0-9a-f-]{36}$/.test(value.roomKey)))
    && (!('sessionStartedAt' in value) || (typeof value.sessionStartedAt === 'number'
      && Number.isSafeInteger(value.sessionStartedAt) && value.sessionStartedAt >= 0))
    && (!('expiresAt' in value) || (typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)))
    && (!('aliases' in value) || (Array.isArray(value.aliases) && value.aliases.length <= 4
      && value.aliases.every(alias => typeof alias === 'string' && alias.length > 0 && alias.length <= MAX_NAME_LENGTH)))
    && (!('graceSeen' in value) || (Array.isArray(value.graceSeen) && value.graceSeen.length <= MAX_NAMES
      && value.graceSeen.every(grace => !!grace && typeof grace === 'object'
        && 'name' in grace && typeof grace.name === 'string' && grace.name.length > 0 && grace.name.length <= MAX_NAME_LENGTH
        && 'until' in grace && typeof grace.until === 'number' && Number.isFinite(grace.until))))
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
  const effectiveSeenByUser = new Map(rosters.map(roster => [roster.userId, [...new Set([
    ...roster.seen,
    ...(roster.graceSeen ?? []).filter(grace => grace.until > startedAt).map(grace => grace.name),
  ])]]));
  const effectiveSeen = (roster: RosterEntry): string[] => effectiveSeenByUser.get(roster.userId) ?? roster.seen;
  for (const a of rosters) {
    for (const seenName of effectiveSeen(a)) {
      for (const b of byName.get(seenName) ?? []) {
        if (a.userId === b.userId || !identityNames(a).some(name => effectiveSeen(b).includes(name))) continue;
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
  // A real split must isolate disconnected components, but renaming every component
  // lets one incomplete client snapshot churn an otherwise stable room. Preserve the
  // canonical key for the component containing the most prior members, then prefer
  // the oldest continuously observed session and a deterministic root tie-breaker.
  const splitWinners = new Map<string, string>();
  const fingerprint = (value: string): string => createHash('sha256').update(value).digest('hex').slice(0, 12);
  for (const [priorRoom, roots] of owners) {
    if (roots.size <= 1) continue;
    const ranked = [...roots].map(root => {
      const priorMembers = (groups.get(root) ?? []).filter(member => member.roomKey === priorRoom);
      return { root, size: priorMembers.length,
        oldest: Math.min(...priorMembers.map(member => member.sessionStartedAt ?? 0)) };
    }).sort((a, b) => b.size - a.size || a.oldest - b.oldest || a.root.localeCompare(b.root));
    const winner = ranked[0]!;
    splitWinners.set(priorRoom, winner.root);
    logger.info?.({ event: 'room_split', roomRef: fingerprint(priorRoom), componentCount: roots.size,
      componentSizes: ranked.map(component => component.size), winnerSize: winner.size },
    '[worldRoster] canonical room split');
    await recordRoomDiagnostic(null, { event: 'room_split', roomRef: opaqueRef(priorRoom),
      componentCount: roots.size, componentSizes: ranked.map(component => component.size), winnerSize: winner.size });
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
      .filter(key => owners.get(key)?.size === 1 || splitWinners.get(key) === root)
      .sort((a, b) => ages.get(a)! - ages.get(b)! || a.localeCompare(b));
    const initial = `r:${members.find(m => m.userId === root)!.session}`;
    // Never resurrect a split room through its original root session UUID.
    const roomKey = candidates[0] ?? (members.some(m => m.roomKey) ? `r:${randomUUID()}` : initial);
    const changedMembers = members.filter(member => !!member.roomKey && member.roomKey !== roomKey);
    // A disappearing sighting can precede a peer's leave. After any applicable
    // partial-sighting grace, isolate live delivery but retain history these
    // unchanged sessions could already read. Never seed a mixed group/new
    // generation/new member from another room.
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
    if (changedMembers.length > 0) {
      logger.info?.({ event: 'room_rebind', reason: candidates.length ? 'component_join' : 'component_split',
        memberRefs: changedMembers.map(member => fingerprint(member.userId)).sort(),
        fromRoomRefs: [...new Set(changedMembers.map(member => fingerprint(member.roomKey!)))].sort(),
        toRoomRef: fingerprint(roomKey), componentSize: members.length,
        observationSources: [...new Set(members.map(member => member.observationSource ?? 'legacy'))].sort() },
      '[worldRoster] canonical room reassigned');
      for (const member of changedMembers) await recordRoomDiagnostic(member.userId, {
        event: 'room_rebind', reason: candidates.length ? 'component_join' : 'component_split',
        fromRoomRef: opaqueRef(member.roomKey!), toRoomRef: opaqueRef(roomKey), componentSize: members.length,
        componentMemberRefs: members.map(item => opaqueRef(item.userId)).sort(),
        observationSources: [...new Set(members.map(item => item.observationSource ?? 'legacy'))].sort(),
      });
    }
  }
  logger.debug({ rosterCount: rosters.length, elapsedMs: Date.now() - startedAt }, '[worldRoster] rooms recomputed');
  return rooms;
}
