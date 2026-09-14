import { Request, Response, NextFunction } from 'express';
import { invalidateEmojiCache, listCustomEmojis } from '../services/discordContextService';

/**
 * Immediately invalidate the emoji cache. Called from discordService.ts on
 * emojiCreate / emojiDelete / emojiUpdate events.
 */
// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/**
 * GET /api/discord-emojis
 * Returns the guild's custom emojis from the bot's in-memory cache.
 * No auth required — rate-limited by the global apiLimiter.
 */
async function getDiscordEmojis(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await listCustomEmojis();
    const data = result.data.map(({ id, name, animated, url }) => ({ id, name, animated, url }));
    res.json({ data, ...(result.stale ? { stale: true } : {}) });
  } catch (err) {
    next(err);
  }
}

export { getDiscordEmojis, invalidateEmojiCache };
module.exports = { getDiscordEmojis, invalidateEmojiCache };
