import { describe, expect, it } from 'vitest';
import { nextConversation, type NavigationSlot } from '../channelNavigation';

const slots: NavigationSlot[] = [
  { kind: 'sub', id: 'general', parentId: 'fo76' },
  { kind: 'sub', id: 'events', parentId: 'fo76' },
  { kind: 'party', id: 'party-one' },
];
describe('conversation cycling', () => {
  it('crosses channel/party boundaries and wraps in both directions', () => {
    expect(nextConversation(slots, { mainId: 'fo76', subId: 'events', partyId: '' }, 'parties', 1)).toBe(slots[2]);
    expect(nextConversation(slots, { mainId: 'parties', subId: 'events', partyId: 'party-one' }, 'parties', 1)).toBe(slots[0]);
    expect(nextConversation(slots, { mainId: 'fo76', subId: 'general', partyId: '' }, 'parties', -1)).toBe(slots[2]);
  });
  it('handles missing selections and an empty eligible list', () => {
    const missing = { mainId: 'parties', subId: '', partyId: 'removed' };
    expect(nextConversation(slots, missing, 'parties', 1)).toBe(slots[0]);
    expect(nextConversation(slots, missing, 'parties', -1)).toBe(slots[2]);
    expect(nextConversation([], missing, 'parties', 1)).toBeNull();
  });
});
