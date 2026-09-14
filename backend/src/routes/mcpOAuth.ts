import express from 'express';
import { authorizationServerMetadata, authorize, consent, discordCallback, protectedResourceMetadata, register, revoke, token } from '../controllers/mcpOAuthController';
import { authLimiter } from '../middleware/rateLimiter';
import env from '../config/environment';
import type { NextFunction, Request, Response } from 'express';

const router = express.Router();
const OWNED_PATHS = new Set([
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/oauth/register',
  '/oauth/authorize',
  '/oauth/discord/callback',
  '/oauth/authorize/consent',
  '/oauth/token',
  '/oauth/revoke',
]);
router.use((req: Request, res: Response, next: NextFunction) => {
  // This router is mounted at `/` for well-known metadata. It must be
  // transparent to every path it does not own or it would shadow legacy MCP
  // and the rest of the backend when the remote-MCP kill switch is off.
  if (!OWNED_PATHS.has(req.path)) { next(); return; }
  res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  if (env.NODE_ENV !== 'production' || !env.MCP_REMOTE_ENABLED) { res.status(404).json({ error: 'temporarily_unavailable' }); return; }
  next();
});
function formOnly(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('application/x-www-form-urlencoded')) { res.status(415).json({ error: 'invalid_request', error_description: 'application/x-www-form-urlencoded is required' }); return; }
    const declared = Number(req.headers['content-length'] || 0);
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    const measured = raw?.length ?? Buffer.byteLength(new URLSearchParams(req.body as Record<string, string>).toString());
    if ((declared && (!Number.isSafeInteger(declared) || declared > maxBytes)) || measured > maxBytes) { res.status(413).json({ error: 'invalid_request', error_description: 'request body is too large' }); return; }
    next();
  };
}
function jsonOnly(maxBytes: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.is('application/json')) { res.status(415).json({ error: 'invalid_client_metadata' }); return; }
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    const measured = raw?.length ?? Buffer.byteLength(JSON.stringify(req.body ?? {}));
    if (measured > maxBytes) { res.status(413).json({ error: 'invalid_client_metadata' }); return; }
    next();
  };
}
router.get('/.well-known/oauth-protected-resource/mcp', protectedResourceMetadata);
router.get('/.well-known/oauth-authorization-server', authorizationServerMetadata);
router.post('/oauth/register', authLimiter, express.json({ limit: '32kb' }), jsonOnly(32 * 1024), register);
router.get('/oauth/authorize', authLimiter, authorize);
router.get('/oauth/discord/callback', authLimiter, discordCallback);
router.post('/oauth/authorize/consent', authLimiter, express.urlencoded({ extended: false, limit: '8kb' }), formOnly(8 * 1024), consent);
router.post('/oauth/token', authLimiter, express.urlencoded({ extended: false, limit: '8kb' }), formOnly(8 * 1024), token);
router.post('/oauth/revoke', authLimiter, express.urlencoded({ extended: false, limit: '8kb' }), formOnly(8 * 1024), revoke);
export default router;
