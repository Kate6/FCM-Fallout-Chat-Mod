interface Account { discordId: string | null; isBanned: boolean; kickedUntil: Date | null }
export interface ModerationAuthorizationDependencies {
  current(): boolean;
  session(): Promise<string | null>;
  account(): Promise<Account | null>;
  role(discordId: string): Promise<string | null>;
}
/** Desktop session transport only; a client-supplied role or room never grants access. */
export async function authorizeServerModeration(accountId: string, webTicket: boolean,
  deps: ModerationAuthorizationDependencies): Promise<boolean> {
  if (webTicket || !deps.current() || await deps.session() !== accountId) return false;
  const account = await deps.account();
  if (!account?.discordId || account.isBanned || (account.kickedUntil && +account.kickedUntil > Date.now())) return false;
  const role = await deps.role(account.discordId);
  return !!role && ['owner', 'admin', 'moderator'].includes(role.toLowerCase())
    && deps.current() && await deps.session() === accountId;
}
