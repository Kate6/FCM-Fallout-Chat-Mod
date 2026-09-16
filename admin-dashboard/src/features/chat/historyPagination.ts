/** Legacy history replies have no request ID. Only an older page for the
 * requested channel may consume a pagination lock; unrelated recovery/party
 * replies continue through the ordinary merge path. An ambiguous empty reply
 * leaves the lock to expire instead of incorrectly declaring end-of-history. */
export function isOlderHistoryBatch(
  incoming: readonly { channelId: string; timestamp: string }[],
  channelId: string | null,
  oldestTimestamp: string | null,
): boolean {
  return !!channelId && !!oldestTimestamp && incoming.length > 0
    && incoming.every(row => row.channelId === channelId && row.timestamp <= oldestTimestamp);
}
