import { describe, expect, it } from 'vitest';
import { isOlderHistoryBatch } from '../historyPagination';

describe('legacy history pagination correlation', () => {
  const boundary = '2026-09-16T12:00:00Z';
  const older = { channelId: 'general', timestamp: '2026-09-15T12:00:00Z' };
  it('accepts an older page from the requested channel', () => {
    expect(isOlderHistoryBatch([older], 'general', boundary)).toBe(true);
  });
  it('does not consume a page request for unrelated, recovery or ambiguous empty replies', () => {
    expect(isOlderHistoryBatch([{ ...older, channelId: 'trading' }], 'general', boundary)).toBe(false);
    expect(isOlderHistoryBatch([older, { ...older, timestamp: '2026-09-17T12:00:00Z' }], 'general', boundary)).toBe(false);
    expect(isOlderHistoryBatch([], 'general', boundary)).toBe(false);
    expect(isOlderHistoryBatch([older], null, null)).toBe(false);
  });
});
