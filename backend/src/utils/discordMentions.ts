/**
 * Build Discord's explicit outbound mention allow-list from syntax produced by
 * trusted FCM resolvers. Callers must strip raw Discord mention markup before
 * invoking this helper.
 */
export function outboundAllowedMentions(content: string): {
  parse: [];
  users: string[];
  roles: string[];
} {
  const users = [...new Set([...content.matchAll(/<@!?(\d{16,22})>/g)].map((match) => match[1]))];
  const roles = [...new Set([...content.matchAll(/<@&(\d{16,22})>/g)].map((match) => match[1]))];
  return { parse: [], users, roles };
}

/**
 * Notification roles use a short chat-friendly alias: "Raids Notifications"
 * is addressable as either @Raids Notifications or @raids in FCM surfaces.
 */
export function roleMentionAliases(roleName: string): string[] {
  const trimmed = roleName.trim();
  if (!trimmed) return [];
  const shortName = trimmed.replace(/\s+notifications$/i, '').trim();
  return shortName && shortName !== trimmed
    ? [trimmed, shortName]
    : [trimmed];
}
