import { describe, expect, it } from 'vitest';
import { reconcileIdentity } from '../auth-identity';

describe('authenticated identity updates', () => {
  const initial = { userId: 'alice', displayName: 'Alice', role: 'moderator', discordLinked: true, steamLinked: true };

  it('keeps omitted identity fields on a partial status refresh', () => {
    const first = reconcileIdentity(null, initial).identity;
    expect(reconcileIdentity(first, { displayName: 'Alice' })).toEqual({ identity: first, resetChat: false });
  });

  it('applies explicit role revocation and unlink without reloading the same account', () => {
    const first = reconcileIdentity(null, initial).identity;
    const result = reconcileIdentity(first, { role: null, steamLinked: false });
    expect(result.identity.role).toBe('user');
    expect(result.identity.steamLinked).toBe(false);
    expect(result.resetChat).toBe(false);
  });

  it('clears old identity fields and resets chat when the account changes', () => {
    const first = reconcileIdentity(null, initial).identity;
    const result = reconcileIdentity(first, { userId: 'bob', displayName: 'Bob' });
    expect(result.resetChat).toBe(true);
    expect(result.identity).toMatchObject({ userId: 'bob', displayName: 'Bob', role: 'user', discordLinked: false, steamLinked: false });
  });

  it('does not reload for a same-account display-name change', () => {
    expect(reconcileIdentity(reconcileIdentity(null, initial).identity, { displayName: 'New name' }).resetChat).toBe(false);
  });
});
