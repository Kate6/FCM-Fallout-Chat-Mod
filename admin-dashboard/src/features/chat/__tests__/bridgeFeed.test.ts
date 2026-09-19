import { describe, it, expect } from 'vitest';
import { readBridgeState, mergeBridgeRows, clearBridgeRows, bridgeSendPayload, bridgeReplayRowsInMainFeed, INACTIVE_BRIDGE } from '../bridgeFeed';

const state = readBridgeState({ status: 'ready', channelId: 'server:r:one', bindingId: 'user_a/nonce/r:one' }, true);
const frame = { channelId: 'server:r:one', bindingId: 'user_a/nonce/r:one' };
const row = (id: number) => ({ id: `server:r:one:${id}`, channelId: 'server:r:one', content: 'same text', timestamp: `2026-09-12T00:00:0${id}Z` });
describe('private bridge feed', () => {
  it('accepts inherited IDs only in current-bound history and deduplicates replay', () => {
    const inherited = { ...row(1), id: 'server:r:00000000-0000-4000-8000-000000000001:1' };
    expect(mergeBridgeRows([], [inherited], state, frame, 100)).toEqual([]);
    const replay = { ...frame, historyReplay: true };
    const first = mergeBridgeRows([], [inherited], state, replay, 100);
    expect(first).toEqual([inherited]);
    expect(mergeBridgeRows(first, [inherited], state, replay, 100)).toBe(first);
    expect(mergeBridgeRows([], [inherited], state, { ...replay, bindingId: 'stale' }, 100)).toEqual([]);
    expect(mergeBridgeRows([], [{ ...inherited, channelId: 'server:r:other' }], state, replay, 100)).toEqual([]);
    expect(mergeBridgeRows([], [{ ...inherited, id: 'global:1' }], state, replay, 100)).toEqual([]);
  });
  it('public/web mode and malformed room states cannot enable Server', () => {
    expect(readBridgeState({ ...frame, status: 'ready' }, false)).toEqual(INACTIVE_BRIDGE);
    expect(readBridgeState({ ...frame, status: 'ready', channelId: 'general' }, true)).toEqual(INACTIVE_BRIDGE);
  });
  it('history overlap and repeated live delivery retain one canonical ID', () => {
    const first = mergeBridgeRows([], [row(1), row(1), row(2)], state, frame, 100);
    expect(first.map(r => r.id)).toEqual(['server:r:one:1', 'server:r:one:2']);
    expect(mergeBridgeRows(first, [row(2)], state, frame, 100)).toBe(first);
  });
  it('rejects stale frames after room changes and reconnects', () => {
    expect(mergeBridgeRows([], [row(1)], state, { ...frame, bindingId: 'old' }, 100)).toEqual([]);
    expect(mergeBridgeRows([], [row(1)], INACTIVE_BRIDGE, frame, 100)).toEqual([]);
  });
  it('rejects foreign rows and IDs while preserving chronological order', () => {
    const rows = mergeBridgeRows([], [row(2), { ...row(1), id: 'global:1' }, row(1), { ...row(3), channelId: 'server:r:other' }], state, frame, 100);
    expect(rows.map(r => r.id)).toEqual(['server:r:one:1', 'server:r:one:2']);
  });
  it('world boundaries remove only server records', () => {
    const global = { id: 'global-id', channelId: 'general' };
    expect(clearBridgeRows([row(1), global])).toEqual([global]);
    const unchanged = [global]; expect(clearBridgeRows(unchanged)).toBe(unchanged);
  });
  it('stamps Server sends with the current binding but preserves General routing', () => {
    expect(bridgeSendPayload({ channelId: frame.channelId, content: 'hello' }, state)).toMatchObject({ bridgeBindingId: frame.bindingId });
    expect(bridgeSendPayload({ channelId: frame.channelId }, INACTIVE_BRIDGE)).toBeNull();
    expect(bridgeSendPayload({ channelId: 'server:r:old' }, state)).toBeNull();
    const general = { channelId: 'general' }; expect(bridgeSendPayload(general, state)).toBe(general);
  });
  it('slots replayed Server rows into the loaded General horizon while Server retains all history', () => {
    const general = [
      { id: 'general:1', channelId: 'general', timestamp: '2026-09-12T00:00:03Z' },
      { id: 'general:2', channelId: 'general', timestamp: '2026-09-12T00:00:05Z' },
    ];
    const server = [row(1), row(4), row(6)];
    const canonical = [...general, ...server].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));
    const replayIds = new Set(server.map(message => message.id));

    expect(bridgeReplayRowsInMainFeed(canonical, replayIds).map(message => message.id)).toEqual([
      'general:1', 'server:r:one:4', 'general:2', 'server:r:one:6',
    ]);
    expect(server.map(message => message.id)).toEqual([
      'server:r:one:1', 'server:r:one:4', 'server:r:one:6',
    ]);
  });
});
