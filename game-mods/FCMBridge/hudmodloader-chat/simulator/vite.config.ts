import { defineConfig, type Plugin } from 'vite';
import { createHostedDevBridge } from './scripts/hosted-dev-bridge.mjs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyKeybindsToIni, defaultKeybinds, normalizeKeybinds } from './src/keybinds.ts';

function json(response: any, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(value));
}

function liveHostedDev(): Plugin {
  const enabled = process.env.FCM_HOSTED_DEV_LIVE === '1';
  const bridge = enabled ? createHostedDevBridge() : null;
  return {
    name: 'fcm-hosted-dev-live-bridge',
    configureServer(server) {
      server.middlewares.use('/__fcm/hosted-dev', async (request, response, next) => {
        if (!enabled || !bridge) return json(response, 404, { enabled: false });
        const origin = String(request.headers.origin || '');
        if (origin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
          return json(response, 403, { error: 'invalid_origin' });
        }
        try {
          if (request.url === '/status' && request.method === 'GET') {
            return json(response, 200, await bridge.status());
          }
          if (request.url === '/send' && request.method === 'POST') {
            let raw = '';
            for await (const chunk of request) {
              raw += chunk;
              if (raw.length > 2048) return json(response, 413, { error: 'payload_too_large' });
            }
            const result: any = await bridge.send(JSON.parse(raw || '{}'));
            return json(response, result.status || 500, result);
          }
        } catch (error) {
          return json(response, 502, { error: error instanceof Error ? error.message : 'hosted_dev_bridge_failed' });
        }
        next();
      });
    },
  };
}

function simulatorKeybinds(): Plugin {
  let profile = { ...defaultKeybinds };
  return {
    name: 'fcm-simulator-keybinds',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = String(request.url || '').split('?')[0];
        try {
          if (path === '/FCMChat.ini' && request.method === 'GET') {
            const source = await readFile(resolve(process.cwd(), 'public/FCMChat.ini'), 'utf8');
            response.statusCode = 200; response.setHeader('content-type', 'text/plain; charset=utf-8');
            return response.end(applyKeybindsToIni(source, profile));
          }
          if (path === '/__fcm/keybinds' && request.method === 'GET') return json(response, 200, { profile });
          if (path === '/__fcm/keybinds/reset' && request.method === 'POST') {
            profile = { ...defaultKeybinds }; return json(response, 200, { profile });
          }
          if (path === '/__fcm/keybinds' && request.method === 'POST') {
            let raw = '';
            for await (const chunk of request) { raw += chunk; if (raw.length > 4096) return json(response, 413, { error: 'payload_too_large' }); }
            profile = normalizeKeybinds(JSON.parse(raw || '{}'));
            return json(response, 200, { profile });
          }
        } catch (error) {
          return json(response, 400, { error: error instanceof Error ? error.message : 'invalid_keybinds' });
        }
        next();
      });
    },
  };
}

export default defineConfig({ plugins: [simulatorKeybinds(), liveHostedDev()] });
