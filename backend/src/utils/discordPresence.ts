export const PRESENCE_ZERO_GRACE_MS = 3 * 60_000;

export function stabilizePresenceCount(rawCount: number, lastNonZeroCount: number, lastNonZeroAt: number, now: number): number {
  if (rawCount > 0) return rawCount;
  return lastNonZeroCount > 0 && now - lastNonZeroAt < PRESENCE_ZERO_GRACE_MS ? lastNonZeroCount : 0;
}
