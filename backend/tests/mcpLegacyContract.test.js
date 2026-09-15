'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEV_ROUTES = [
  ['GET', '/health'],
  ['GET', '/version'],
  ['GET', '/wiki/search'],
  ['GET', '/camp/search'],
  ['GET', '/channels'],
  ['GET', '/commands'],
  ['GET', '/messages'],
  ['GET', '/parties'],
  ['GET', '/users/search'],
  ['GET', '/releases'],
  ['GET', '/ws/snapshot'],
  ['GET', '/ws/count'],
  ['POST', '/messages/send'],
  ['POST', '/sim/stream'],
  ['POST', '/sim/users'],
];

const PROD_READ_ROUTES = [
  '/health', '/version', '/channels', '/commands', '/users', '/users/:id',
  '/users/search', '/messages', '/messages/search', '/parties', '/releases',
  '/audit-log', '/reports', '/bans', '/moderation-settings', '/name-blacklist',
  '/community-stats', '/ws/snapshot', '/ws/count', '/wiki/search', '/camp/search',
];

const PROD_MUTATION_ROUTES = [
  ['POST', '/channels'],
  ['PATCH', '/channels/:id'],
  ['DELETE', '/channels/:id'],
  ['POST', '/commands'],
  ['PATCH', '/commands/:id'],
  ['DELETE', '/commands/:id'],
  ['POST', '/messages/send'],
  ['DELETE', '/messages/:id'],
  ['POST', '/bans'],
  ['POST', '/bans/:id/reverse'],
  ['POST', '/mutes'],
  ['DELETE', '/mutes/:userId'],
  ['POST', '/kicks'],
  ['PATCH', '/reports/:id'],
  ['POST', '/releases'],
  ['POST', '/name-blacklist'],
  ['DELETE', '/name-blacklist/:id'],
];

// These legacy routes rely on the stdio tool's confirmation guard only. This
// intentionally records the existing gap so the OAuth migration can close it
// without anyone mistaking client-side confirmation for backend enforcement.
const CLIENT_GUARDED_ONLY_ROUTES = new Set([
  'POST /channels',
  'PATCH /channels/:id',
  'DELETE /channels/:id',
  'POST /commands',
  'PATCH /commands/:id',
  'DELETE /commands/:id',
]);

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function registeredRoutes(routerSource) {
  return [...routerSource.matchAll(/router\.(get|post|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
    .map((match) => [match[1].toUpperCase(), match[2]]);
}

describe('legacy MCP backend contract', () => {
  test('keeps the development endpoint inventory and dev-token gate stable', () => {
    const routerSource = source('src/routes/mcp.ts');
    expect(registeredRoutes(routerSource)).toEqual(DEV_ROUTES);
    expect(routerSource).toContain("requireMcpToken('dev')");
  });

  test('keeps the production endpoint inventory and prod-token gate stable', () => {
    const routerSource = source('src/routes/mcpAdmin.ts');
    const expected = [
      ...PROD_READ_ROUTES.map((route) => ['GET', route]),
      ...PROD_MUTATION_ROUTES,
    ];
    expect(registeredRoutes(routerSource)).toEqual(expect.arrayContaining(expected));
    expect(registeredRoutes(routerSource)).toHaveLength(expected.length);
    expect(routerSource).toContain("requireMcpToken('prod')");
  });

  test('keeps server mount points stable during the OAuth migration window', () => {
    const serverSource = source('src/server.ts');
    expect(serverSource).toContain("app.use('/api/mcp', mcpRouter)");
    expect(serverSource).toContain("app.use('/api/mcp-admin', mcpAdminRouter)");
  });

  test.each(PROD_MUTATION_ROUTES)('%s %s records its legacy backend confirmation behavior', (method, route) => {
    const routerSource = source('src/routes/mcpAdmin.ts');
    const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextRoute = /\n\/\/ (?:GET|POST|PATCH|DELETE) /;
    const start = routerSource.search(new RegExp(`router\\.${method.toLowerCase()}\\(\\s*['"]${escapedRoute}['"]`));
    expect(start).toBeGreaterThanOrEqual(0);
    const remainder = routerSource.slice(start);
    const end = remainder.search(nextRoute);
    const handlerSource = end === -1 ? remainder : remainder.slice(0, end);
    const usesBackendGuard = /requireConfirm\(req, next\)/.test(handlerSource);
    expect(usesBackendGuard).toBe(!CLIENT_GUARDED_ONLY_ROUTES.has(`${method} ${route}`));
  });
});
