import type { NextFunction, Request, Response } from 'express';
import { createError } from '../middleware/errorHandler';
import { listRoomDiagnostics } from '../services/relay/roomDiagnostics';

export async function getRoomDiagnostics(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawUserId = req.query.userId;
    const rawLimit = req.query.limit;
    if (rawUserId !== undefined && typeof rawUserId !== 'string') {
      return next(createError(400, 'userId must be a string'));
    }
    if (rawLimit !== undefined && typeof rawLimit !== 'string') {
      return next(createError(400, 'limit must be a string'));
    }
    const userId = typeof rawUserId === 'string' && rawUserId.trim() ? rawUserId.trim() : undefined;
    if (userId && !/^user_[0-9a-f]{32}$/.test(userId)) {
      return next(createError(400, 'userId must be a relay user ID'));
    }
    const limit = Math.min(200, Math.max(1, Number.parseInt(rawLimit ?? '100', 10) || 100));
    const items = await listRoomDiagnostics(userId, limit);
    res.json({ data: { scope: userId ? 'user' : 'recent', count: items.length, items } });
  } catch (err) { next(err); }
}
