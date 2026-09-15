export interface McpActor {
  discordId: string;
  clientId: string;
  role: 'owner' | 'admin' | 'developer';
  scopes: string[];
  grantId: string;
  correlationId?: string;
}

export function isActor(value: unknown): value is McpActor {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Partial<McpActor>;
  return typeof actor.discordId === 'string' && typeof actor.clientId === 'string'
    && (actor.role === 'owner' || actor.role === 'admin' || actor.role === 'developer')
    && Array.isArray(actor.scopes) && actor.scopes.every(scope => typeof scope === 'string')
    && typeof actor.grantId === 'string';
}
