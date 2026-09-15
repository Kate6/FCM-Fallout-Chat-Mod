import env from '../config/environment';
import logger from '../config/logger';
import { getDiscordClient, listAssignableRoles, listTextChannels } from './discordService';

export interface DiscordEmoji {
  id: string;
  name: string;
  animated: boolean;
  tag: string;
  url: string;
}

interface EmojiCache {
  data: DiscordEmoji[];
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let emojiCache: EmojiCache | null = null;

export function invalidateEmojiCache(): void {
  emojiCache = null;
  logger.debug('Discord emoji cache invalidated');
}

function loadEmojiList(): DiscordEmoji[] | null {
  const client = getDiscordClient();
  if (!client || !client.isReady()) return null;
  const guild = client.guilds.cache.get(env.DISCORD_SERVER_ID);
  if (!guild) return null;
  const emojis: DiscordEmoji[] = [];
  for (const emoji of guild.emojis.cache.values()) {
    if (!emoji.id || !emoji.name) continue;
    const animated = emoji.animated ?? false;
    emojis.push({
      id: emoji.id,
      name: emoji.name,
      animated,
      tag: animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`,
      url: animated
        ? `https://cdn.discordapp.com/emojis/${emoji.id}.webp?animated=true`
        : `https://cdn.discordapp.com/emojis/${emoji.id}.png`,
    });
  }
  return emojis.sort((a, b) => a.animated === b.animated ? a.name.localeCompare(b.name) : (a.animated ? -1 : 1));
}

export async function listCustomEmojis(): Promise<{ data: DiscordEmoji[]; stale?: true }> {
  const now = Date.now();
  if (emojiCache && now < emojiCache.expiresAt) return { data: emojiCache.data };
  const fresh = loadEmojiList();
  if (fresh === null) return { data: emojiCache?.data ?? [], stale: true };
  emojiCache = { data: fresh, expiresAt: now + CACHE_TTL_MS };
  return { data: fresh };
}

export async function getCustomEmoji(id: string): Promise<DiscordEmoji | null> {
  const { data } = await listCustomEmojis();
  return data.find((emoji) => emoji.id === id) ?? null;
}

export async function getContext() {
  const [channels, roles, emojis] = await Promise.all([
    listTextChannels(),
    listAssignableRoles(),
    listCustomEmojis(),
  ]);
  return { channels, roles, emojis: emojis.data, ...(emojis.stale ? { stale: true as const } : {}) };
}

export { listTextChannels, listAssignableRoles };
export default { listTextChannels, listAssignableRoles, listCustomEmojis, getCustomEmoji, getContext, invalidateEmojiCache };
