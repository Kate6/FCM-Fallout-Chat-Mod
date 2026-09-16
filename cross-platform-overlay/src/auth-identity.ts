export interface AuthenticatedIdentity {
  userId: string | null;
  displayName: string;
  role: string;
  discordLinked: boolean;
  steamLinked: boolean;
}

type IdentityUpdate = Partial<Omit<AuthenticatedIdentity, 'role'>> & { role?: string | null };

/** Omitted status fields are unchanged; an explicit revoked role is authoritative. */
export function reconcileIdentity(previous: AuthenticatedIdentity | null, update: IdentityUpdate) {
  const resetChat = previous !== null && !!update.userId && update.userId !== previous.userId;
  const base: AuthenticatedIdentity = previous && !resetChat ? previous : {
    userId: null, displayName: '', role: 'user', discordLinked: false, steamLinked: false,
  };
  const identity: AuthenticatedIdentity = {
    userId: update.userId || base.userId,
    displayName: update.displayName ?? base.displayName,
    role: update.role === undefined ? base.role : update.role || 'user',
    discordLinked: update.discordLinked ?? base.discordLinked,
    steamLinked: update.steamLinked ?? base.steamLinked,
  };
  return { identity, resetChat };
}
