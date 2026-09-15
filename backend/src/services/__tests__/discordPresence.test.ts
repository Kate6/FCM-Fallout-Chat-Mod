import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESENCE_ZERO_GRACE_MS, stabilizePresenceCount } from '../../utils/discordPresence';

test('presence holds the last non-zero count through the zero-count grace window', () => {
  assert.equal(stabilizePresenceCount(0, 7, 1_000, 1_000 + (PRESENCE_ZERO_GRACE_MS - 1)), 7);
  assert.equal(stabilizePresenceCount(0, 7, 1_000, 1_000 + PRESENCE_ZERO_GRACE_MS), 0);
});
