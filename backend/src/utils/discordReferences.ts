export type DiscordMessageEntity =
  | { type: 'user'; discordId: string; label: string }
  | { type: 'channel'; discordId: string; label: string; url: string };

export type DiscordReferenceLabels = {
  users: ReadonlyMap<string, string>;
  channels: ReadonlyMap<string, string>;
  guildId: string | null;
};

/**
 * Turn Discord's opaque mention markup into readable overlay text while retaining
 * the snowflake that makes the reference unambiguous. The returned entities are
 * persisted with the message and are the canonical identity contract for clients.
 */
export function normalizeDiscordReferences(
  content: string,
  labels: DiscordReferenceLabels,
): { content: string; entities: DiscordMessageEntity[] } {
  const entities: DiscordMessageEntity[] = [];
  const seen = new Set<string>();

  let normalized = content.replace(/<@!?(\d{16,22})>/g, (_token, discordId: string) => {
    const label = labels.users.get(discordId) || 'user';
    const key = `user:${discordId}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ type: 'user', discordId, label });
    }
    return `@${label}`;
  });

  normalized = normalized.replace(/<#(\d{16,22})>/g, (_token, discordId: string) => {
    const label = labels.channels.get(discordId) || 'channel';
    const guildId = labels.guildId;
    const url = guildId
      ? `https://discord.com/channels/${guildId}/${discordId}`
      : `https://discord.com/channels/@me/${discordId}`;
    const key = `channel:${discordId}`;
    if (!seen.has(key)) {
      seen.add(key);
      entities.push({ type: 'channel', discordId, label, url });
    }
    return `#${label}`;
  });

  return { content: normalized, entities };
}

export function discordEventReference(content: string): { guildId: string; scheduledEventId: string; url: string } | null {
  const match = content.match(/https?:\/\/(?:www\.)?discord(?:app)?\.com\/events\/(\d{16,22})\/(\d{16,22})(?:[/?#][^\s<]*)?/i);
  if (!match) return null;
  return { guildId: match[1], scheduledEventId: match[2], url: match[0] };
}
