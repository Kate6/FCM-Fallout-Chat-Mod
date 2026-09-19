export type BridgeState = { status: 'ready'; channelId: string; bindingId: string }
  | { status: 'inactive' | 'ambiguous' | 'unavailable' };
export const INACTIVE_BRIDGE: BridgeState = { status: 'inactive' };

export function readBridgeState(value: unknown, enabled: boolean): BridgeState {
  if (!enabled || !value || typeof value !== 'object') return INACTIVE_BRIDGE;
  const p = value as Record<string, unknown>;
  if (p.status === 'ready' && typeof p.channelId === 'string' && /^server:r:[a-z0-9-]{1,64}$/.test(p.channelId)
    && typeof p.bindingId === 'string' && p.bindingId.length <= 256 && p.bindingId.endsWith(`/${p.channelId.slice(7)}`)) {
    return { status: 'ready', channelId: p.channelId, bindingId: p.bindingId };
  }
  return { status: p.status === 'ambiguous' || p.status === 'unavailable' ? p.status : 'inactive' };
}

type Row = { id: string; channelId: string; timestamp?: string };
/** Main General and Server render this same collection; never copy messages into
 * the General channel or collapse different IDs with matching text. */
export function mergeBridgeRows<T extends Row>(previous: T[], incoming: T[], state: BridgeState,
  frame: { bindingId?: unknown; channelId?: unknown; historyReplay?: unknown }, cap: number): T[] {
  if (state.status !== 'ready' || state.bindingId !== frame.bindingId || state.channelId !== frame.channelId) return previous;
  const seen = new Set(previous.map(row => row.id));
  const fresh = incoming.filter(row => {
    const currentId = row.id.startsWith(`${state.channelId}:`)
      && /^[1-9][0-9]*$/.test(row.id.slice(state.channelId.length + 1));
    const retainedId = frame.historyReplay === true
      && /^server:r:[0-9a-f-]{36}:[1-9][0-9]*$/.test(row.id);
    if (row.channelId !== state.channelId || (!currentId && !retainedId) || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  if (!fresh.length) return previous;
  return [...previous, ...fresh].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '')).slice(-cap);
}

export function clearBridgeRows<T extends Row>(rows: T[]): T[] {
  return rows.some(row => row.channelId.startsWith('server:')) ? rows.filter(row => !row.channelId.startsWith('server:')) : rows;
}

/** Keep replay storage canonical while limiting General to its loaded time span.
 * The dedicated Server view still reads the unfiltered collection. */
export function bridgeReplayRowsInMainFeed<T extends Row>(rows: T[], replayIds: ReadonlySet<string>): T[] {
  let oldestLoadedTimestamp: string | null = null;
  for (const row of rows) {
    if (row.channelId.startsWith('server:') || !row.timestamp) continue;
    if (oldestLoadedTimestamp === null || row.timestamp < oldestLoadedTimestamp) oldestLoadedTimestamp = row.timestamp;
  }
  if (oldestLoadedTimestamp === null) return rows;
  return rows.filter(row => !replayIds.has(row.id)
    || (typeof row.timestamp === 'string' && row.timestamp >= oldestLoadedTimestamp));
}

export function bridgeSendPayload<T extends { channelId?: string }>(payload: T, state: BridgeState): (T & { bridgeBindingId?: string }) | null {
  if (!payload.channelId?.startsWith('server:')) return payload;
  return state.status === 'ready' && payload.channelId === state.channelId
    ? { ...payload, bridgeBindingId: state.bindingId } : null;
}
