import express, { NextFunction, Request, Response, Router } from 'express';
import { createHash } from 'crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import env from '../config/environment';
import { McpOAuthError, mcpAuthorizationService } from '../services/mcpAuthorizationService';
import { createMcpServer, McpActor } from './server';
import { getRedisClient } from '../config/redis';
import { randomUUID } from 'crypto';
import { auditMcpDenial, recordMcpMetric } from '../services/mcpAuditService';

// Auth and shared rate limiting run before this parser. 14 MiB accommodates a
// 10 MiB file encoded as base64 plus the MCP JSON-RPC envelope.
const MAX_BODY_BYTES = 14 * 1024 * 1024;
const RATE_MAX = 120;

interface AuthorizationService {
  verifyAccessToken(token: string, audience: string, requiredScopes?: readonly string[]): Promise<McpActor>;
}
interface RouterOptions {
  authorizationService?: AuthorizationService;
  enabled?: () => boolean;
  allowedOrigins?: () => readonly string[];
  resourceUrl?: () => string;
  rateMax?: number;
  rateLimit?: (grantId: string, maximum: number) => Promise<boolean>;
  serverFactory?: () => McpServer;
}

type AuthenticatedRequest = Request & { auth?: AuthInfo; mcpCorrelationId?: string };
const MUTATION_SCOPES: Readonly<Record<string, string>> = {
  fcm_embeds_create: 'fcm:discord:write', fcm_embeds_update: 'fcm:discord:write', fcm_embeds_delete: 'fcm:discord:write',
  fcm_embed_asset_import: 'fcm:discord:write', fcm_asset_upload: 'fcm:discord:write', fcm_embeds_send: 'fcm:discord:write', fcm_reaction_role_panels_delete: 'fcm:discord:write',
  fcm_action_write: 'fcm:moderation:write',
};

export function createMcpTransportRouter(options: RouterOptions = {}): Router {
  const router = Router();
  const authorization = options.authorizationService ?? mcpAuthorizationService;
  const enabled = options.enabled ?? (() => env.NODE_ENV === 'production' && env.MCP_REMOTE_ENABLED);
  const origins = options.allowedOrigins ?? (() => env.MCP_ALLOWED_ORIGINS);
  const resourceUrl = options.resourceUrl ?? (() => env.MCP_RESOURCE_URL);
  const rateLimit = options.rateLimit ?? checkSharedRateLimit;
  const serverFactory = options.serverFactory ?? createMcpServer;

  router.use((req: AuthenticatedRequest, res, next) => {
    req.mcpCorrelationId = req.get('x-correlation-id')?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)?.[0] ?? randomUUID();
    res.set('X-Correlation-ID', req.mcpCorrelationId);
    next();
  });

  router.get('/health', (_req, res) => {
    res.status(enabled() ? 200 : 503).json({ status: enabled() ? 'ok' : 'disabled' });
  });

  router.get('/', (_req, res) => methodNotAllowed(res, 'GET is not supported for stateless MCP'));
  router.delete('/', (_req, res) => methodNotAllowed(res, 'DELETE is not supported for stateless MCP'));

  router.post('/', (req: AuthenticatedRequest, res, next) => {
    const deny = (status: number, code: number, message: string, reason: string) => { auditMcpDenial({ correlationId: req.mcpCorrelationId!, reason }); return jsonRpcHttpError(res, status, code, message); };
    if (!enabled()) return deny(404, -32001, 'Remote MCP is disabled', 'disabled');
    const origin = req.get('origin');
    if (origin && !origins().includes(origin)) return deny(403, -32002, 'Origin is not allowed', 'origin');
    if (!req.is('application/json')) return deny(415, -32600, 'Content-Type must be application/json', 'content_type');
    const version = req.get('mcp-protocol-version');
    if (version && !SUPPORTED_PROTOCOL_VERSIONS.includes(version)) return deny(400, -32600, 'Unsupported MCP-Protocol-Version', 'protocol_version');
    next();
  }, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const correlationId = req.mcpCorrelationId!;
    const header = req.get('authorization');
    const match = header?.match(/^Bearer ([^\s]+)$/i);
    if (!match) { auditMcpDenial({ correlationId, reason: 'missing_bearer' }); return bearerError(res, resourceUrl(), 401, 'invalid_request', 'A bearer access token is required'); }
    try {
      const actor = await authorization.verifyAccessToken(match[1], resourceUrl());
      if (!await rateLimit(actor.grantId, options.rateMax ?? RATE_MAX)) { auditMcpDenial({ correlationId, reason: 'rate_limit', actorDiscordId: actor.discordId, clientId: actor.clientId, grantId: actor.grantId }); return jsonRpcHttpError(res, 429, -32003, 'Rate limit exceeded'); }
      req.auth = {
        token: match[1], clientId: actor.clientId, scopes: [...actor.scopes], resource: new URL(resourceUrl()),
        extra: { actor: { ...actor, scopes: [...actor.scopes], correlationId } satisfies McpActor },
      };
      recordMcpMetric('oauth', { outcome: 'success' });
      next();
    } catch (error) {
      const oauthCode = error instanceof McpOAuthError && error.code === 'invalid_scope' ? 'insufficient_scope' : 'invalid_token';
      const status = oauthCode === 'insufficient_scope' ? 403 : 401;
      recordMcpMetric('oauth', { outcome: 'failure' });
      auditMcpDenial({ correlationId, reason: oauthCode });
      return bearerError(res, resourceUrl(), status, oauthCode, oauthCode === 'insufficient_scope' ? 'The bearer token has insufficient scope' : 'The bearer access token is invalid');
    }
  }, express.json({ limit: MAX_BODY_BYTES }), (req: AuthenticatedRequest, res, next) => {
    const body = req.body as { method?: unknown; params?: { name?: unknown; arguments?: Record<string, unknown> } };
    if (body.method !== 'tools/call' || typeof body.params?.name !== 'string') { next(); return; }
    const actor = req.auth?.extra?.actor;
    const tool = body.params.name;
    const target = body.params.arguments?.id ?? body.params.arguments?.channelId ?? null;
    const required = MUTATION_SCOPES[tool];
    if (required && (!isMcpActor(actor) || !actor.scopes.includes(required))) {
      auditMcpDenial({ correlationId: req.mcpCorrelationId!, reason: 'insufficient_scope', tool, target: typeof target === 'string' || typeof target === 'number' ? target : null,
        ...(isMcpActor(actor) ? { actorDiscordId: actor.discordId, clientId: actor.clientId, grantId: actor.grantId } : {}) });
    } else if (required && body.params.arguments?.confirm !== true) {
      auditMcpDenial({ correlationId: req.mcpCorrelationId!, reason: 'confirmation_required', tool, target: typeof target === 'string' || typeof target === 'number' ? target : null,
        ...(isMcpActor(actor) ? { actorDiscordId: actor.discordId, clientId: actor.clientId, grantId: actor.grantId } : {}) });
    } else if (!required) {
      res.once('finish', () => recordMcpMetric('tool_call', { tool: tool.replace(/^fcm_/, ''), outcome: res.statusCode < 400 ? 'success' : 'failure' }));
    }
    next();
  }, async (req: AuthenticatedRequest, res: Response) => {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = serverFactory();
    let closed = false;
    const close = async () => {
      if (closed) return;
      closed = true;
      await transport.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    };
    res.once('close', () => { void close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) jsonRpcHttpError(res, 500, -32603, 'Internal MCP error');
    } finally {
      if (res.writableEnded) await close();
    }
  });

  router.use((error: unknown, req: AuthenticatedRequest, res: Response, _next: NextFunction) => {
    const bodyError = error as { type?: string; status?: number };
    if (bodyError.type === 'entity.too.large' || bodyError.status === 413) { auditMcpDenial({ correlationId: req.mcpCorrelationId ?? randomUUID(), reason: 'body_size' }); return jsonRpcHttpError(res, 413, -32600, 'MCP request body is too large'); }
    auditMcpDenial({ correlationId: req.mcpCorrelationId ?? randomUUID(), reason: 'malformed_json' });
    return jsonRpcHttpError(res, 400, -32700, 'Malformed JSON');
  });
  return router;
}

function isMcpActor(value: unknown): value is McpActor {
  return Boolean(value && typeof value === 'object' && 'discordId' in value && 'clientId' in value && 'grantId' in value && 'scopes' in value && Array.isArray((value as McpActor).scopes));
}

const RATE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return count
`;

export async function checkSharedRateLimit(grantId: string, maximum: number): Promise<boolean> {
  // Hash the opaque database identifier so Redis keys disclose no actor/grant data.
  const key = `mcp:rate:${createHash('sha256').update(grantId).digest('hex')}`;
  try {
    const redis = await getRedisClient();
    const count = await redis.eval(RATE_SCRIPT, { keys: [key], arguments: ['60'] });
    return Number(count) <= maximum;
  } catch {
    // This is an administrative mutation surface: Redis outages fail closed.
    return false;
  }
}

function bearerError(res: Response, resource: string, status: 401 | 403, code: string, description: string, requiredScope?: string): Response {
  const escaped = (value: string) => value.replace(/["\\]/g, '\\$&');
  const metadataUrl = new URL('/.well-known/oauth-protected-resource/mcp', resource).href;
  const scope = requiredScope ? `, scope="${escaped(requiredScope)}"` : '';
  res.set('WWW-Authenticate', `Bearer resource_metadata="${escaped(metadataUrl)}", error="${escaped(code)}", error_description="${escaped(description)}"${scope}`);
  return jsonRpcHttpError(res, status, -32000, description);
}

function jsonRpcHttpError(res: Response, status: number, code: number, message: string): Response {
  return res.status(status).type('application/json').send({ jsonrpc: '2.0', error: { code, message }, id: null });
}

function methodNotAllowed(res: Response, message: string): Response {
  res.set('Allow', 'POST');
  return jsonRpcHttpError(res, 405, -32600, message);
}

export const mcpTransportRouter = createMcpTransportRouter();
