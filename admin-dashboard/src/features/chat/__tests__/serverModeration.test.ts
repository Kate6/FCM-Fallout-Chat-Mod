import { describe, expect, it } from 'vitest';
import { mergeModeratorRows, normalizeMutedRooms, readModeratorRows, readMutedRoomPreferences, serverRoomLabel, shouldMarkChannelUnread } from '../serverModeration';

describe('Server moderation presentation', () => {
  it('never exposes IDs to regular users and omits the ID on staff own room', () => {
    expect(serverRoomLabel(false, 'server:r:a', 'server:r:a', '123')).toBe('Server');
    expect(serverRoomLabel(true, 'server:r:a', 'server:r:a', '123')).toBe('Your server');
    expect(serverRoomLabel(true, 'server:r:b', 'server:r:a', '124')).toBe('Server · 124');
    expect(serverRoomLabel(true, 'server:r:b', null, '<script>')).toBe('Server');
  });
  it('bounds and validates room preferences and incoming rows', () => {
    expect(readMutedRoomPreferences({ ids: ['server:r:a'], labels: { 'server:r:a': '123', 'server:r:b': '456' } })).toEqual({ ids: ['server:r:a'], labels: { 'server:r:a': '123' } });
    expect(normalizeMutedRooms(['server:r:a', 'server:r:a', 'party:private', 3])).toEqual(['server:r:a']);
    expect(normalizeMutedRooms({})).toEqual([]);
    expect(readModeratorRows([{ id: 'x', channelId: 'party:private', content: 'private', username: 'x' }])).toEqual([]);
  });
  it('deduplicates bridge and moderator message IDs without conflating same-text messages', () => {
    const row = { id: 'server:r:a:1', channelId: 'server:r:a', username: 'x', content: 'same', source: 'server', timestamp: '2026-09-18' };
    expect(mergeModeratorRows([row], [{ ...row, serverDisplayId: '1' }, { ...row, id: 'server:r:a:2' }])).toHaveLength(2);
  });
});

describe('unread channel dot eligibility', () => {
  const incoming = { self: false, replay: false, duplicate: false, muted: false, visible: true, inView: false };
  it('badges only genuinely unseen incoming messages', () => {
    expect(shouldMarkChannelUnread(incoming)).toBe(true);
    for (const flag of ['self', 'replay', 'duplicate', 'muted', 'inView']) expect(shouldMarkChannelUnread({ ...incoming, [flag]: true })).toBe(false);
    expect(shouldMarkChannelUnread({ ...incoming, inView: true, visible: false })).toBe(false);
  });
});
