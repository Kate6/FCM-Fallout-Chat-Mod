#!/usr/bin/env node
// Local synthetic chat only. Never attaches to or closes a user's running app.
import { _electron as electron } from '../../admin-dashboard/node_modules/playwright/test.mjs';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir, cpus, release, platform } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { extractFile } from '@electron/asar';
import { cpuDeltas, summarizeCpu } from './profile-metrics.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2];
if (!executable) throw new Error('Usage: node scripts/profile-idle.mjs /absolute/path/to/dev/executable');
const archive = resolve(dirname(executable), 'resources/app.asar');
const metadata = JSON.parse(extractFile(archive, 'package.json').toString());
if (metadata.fcmChannel !== 'qa' || metadata.fcmPortable) throw new Error('Only non-portable Dev/QA packages may be profiled');
const seconds = Number(process.env.FCM_PROFILE_SECONDS || 15);
if (!Number.isInteger(seconds) || seconds < 5 || seconds > 300) throw new Error('Duration must be 5–300 seconds');
const effectId = process.env.FCM_PROFILE_EFFECT || null;
if (effectId && !['shimmer', 'glow-pulse', 'crt-phosphor', 'glitch', 'chroma-split'].includes(effectId)) throw new Error('Unsupported fixture effect');
const profile = await mkdtemp(`${tmpdir()}/fcm-idle-profile-`);
const channels = [{ id: 'fo76', name: 'Fallout 76', parentId: null, children: [
  { id: 'general', name: 'General', parentId: 'fo76', color: '#F5CB5B' },
] }];
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  let data = [];
  if (path === '/api/users') data = { token: 'fixture-only-session', userId: 'alice', username: 'Alice', displayName: 'Alice', discordLinked: true, role: 'admin' };
  else if (path.startsWith('/api/auth/qa-status/')) data = { authorized: true, token: 'fixture-only-session', displayName: 'Alice', role: 'admin' };
  else if (path === '/api/channels') data = channels;
  else if (path === '/api/block') data = { blocked: [] };
  else if (path.startsWith('/api/parties/invites')) data = { invites: [] };
  else if (path.startsWith('/api/parties')) data = { parties: [] };
  else if (path.includes('/discord-status/')) data = { linked: true, discordUsername: 'Alice' };
  else if (path.includes('/steam-status/')) data = { linked: false };
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ data }));
});
const relay = new WebSocketServer({ server });
relay.on('connection', socket => socket.on('message', raw => {
  const frame = JSON.parse(raw.toString());
  if (frame.type !== 'chat:history') return;
  const channelId = frame.payload.channelId;
  socket.send(JSON.stringify({ type: 'chat:history', payload: { messages: channelId === 'general' ? Array.from({ length: 250 }, (_, index) => ({
    id: `${channelId}-${index}`, channel_id: channelId, user_id: 'bob', username: 'Bob',
    content: `Static fixture ${index}`, source: 'game', effectId,
    created_at: new Date(Date.UTC(2026, 8, 16, 12, 0, index)).toISOString(),
  })) : [] } }));
}));
let app;
let interrupted = false;
const interrupt = () => { interrupted = true; void app?.close().catch(() => {}); };
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await writeFile(`${profile}/overlay-state.json`, JSON.stringify({
    installToken: 'performance-fixture-only', username: 'Alice', displayName: 'Alice',
    discordLinked: true, userRole: 'admin', settings: { onboarded: true, fadeWhenIdle: false, fontSize: 14 },
  }));
  const env = { ...process.env, APP_CLIENT_KEY: 'fixture-only-client',
    BROWSER: process.platform === 'linux' ? '/bin/true' : process.env.BROWSER,
    RELAY_HTTP: `http://127.0.0.1:${port}`, RELAY_WS: `ws://127.0.0.1:${port}/ws`,
    XDG_CURRENT_DESKTOP: '', XDG_SESSION_DESKTOP: '', XDG_SESSION_TYPE: 'x11',
  };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'APPIMAGE', 'APPDIR', 'RENDERER_URL', 'WAYLAND_DISPLAY',
    'OVERLAY_SHOT', 'OVERLAY_FIRE', 'DEV_PERSONA_LOGIN_SECRET']) delete env[key];
  app = await electron.launch({ executablePath: resolve(executable),
    args: [`--user-data-dir=${profile}`, '--ozone-platform=x11', '--no-sandbox'], env, timeout: 30_000 });
  if (interrupted) throw new Error('Profiling interrupted');
  // OAuth is served by the fixture; do not open a browser outside the owned app.
  await app.evaluate(({ shell }) => { shell.openExternal = async () => {}; });
  const page = await app.firstWindow();
  await page.getByText('Static fixture 249', { exact: true }).waitFor({ timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Profiler.enable');
  const displays = await app.evaluate(({ screen }) => screen.getAllDisplays().map(display => ({
    size: display.size, scaleFactor: display.scaleFactor, refreshHz: display.displayFrequency,
  })));
  console.log(JSON.stringify({ kind: 'environment', platform: platform(), os: release(), cpu: cpus()[0]?.model,
    desktop: process.env.XDG_CURRENT_DESKTOP || 'unreported', displays,
    packageSha256: createHash('sha256').update(await readFile(archive)).digest('hex'),
    seconds, warmupSeconds: 60, effectId }));
  for (const visible of [true, false]) {
    await app.evaluate(({ BrowserWindow, ipcMain }, visible) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.webContents.send('overlay:game-state', true);
      if (visible) { ipcMain.emit('overlay:show-for-mention'); window.blur(); }
      else ipcMain.emit('window:hide');
    }, visible);
    await page.waitForTimeout(60_000);
    const actual = await app.evaluate(({ BrowserWindow }) => ({ visible: BrowserWindow.getAllWindows()[0].isVisible(),
      focused: BrowserWindow.getAllWindows()[0].isFocused() }));
    const motion = await page.evaluate(() => ({
      rows: document.querySelectorAll('[data-fcm-message-line]').length,
      pausedNames: document.querySelectorAll('[data-fcm-motion-paused]').length,
      runningAnimations: document.getAnimations().filter(animation => animation.playState === 'running').length,
    }));
    if (actual.visible !== visible || actual.focused) throw new Error('Window did not reach requested unfocused state');
    const before = await cdp.send('Performance.getMetrics');
    await cdp.send('Profiler.start');
    // Prime Electron's process CPU sample, then take one-second deltas.
    let prior = await app.evaluate(({ app }) => ({ time: performance.now(), processes: app.getAppMetrics() }));
    const cpu = [];
    for (let second = 0; second < seconds; second++) {
      await page.waitForTimeout(1000);
      const current = await app.evaluate(({ app }) => ({ time: performance.now(), processes: app.getAppMetrics() }));
      cpu.push(cpuDeltas(prior, current));
      prior = current;
    }
    const { profile: sample } = await cdp.send('Profiler.stop');
    const after = await cdp.send('Performance.getMetrics');
    const counts = new Map();
    for (let i = 0; i < (sample.samples || []).length; i++) {
      const id = sample.samples[i]; counts.set(id, (counts.get(id) || 0) + (sample.timeDeltas?.[i] || 0));
    }
    const top = sample.nodes.map(node => ({ name: node.callFrame.functionName || '(anonymous)',
      file: node.callFrame.url.split('/').pop(), line: node.callFrame.lineNumber + 1,
      column: node.callFrame.columnNumber + 1, milliseconds: (counts.get(node.id) || 0) / 1000,
    })).sort((a, b) => b.milliseconds - a.milliseconds).slice(0, 20);
    const metrics = Object.fromEntries(after.metrics.filter(m => /Duration|Count$/.test(m.name)).map(m => [m.name,
      m.value - (before.metrics.find(b => b.name === m.name)?.value || 0)]));
    console.log(JSON.stringify({ kind: 'sample', ...actual, motion, cpu: summarizeCpu(cpu), metrics, top }));
  }
  await cdp.detach();
} finally {
  // ElectronApplication owns this isolated process, never the user's live instance.
  try { if (app) await app.close(); } finally {
    for (const socket of relay.clients) socket.terminate();
    await new Promise(resolve => relay.close(resolve));
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
