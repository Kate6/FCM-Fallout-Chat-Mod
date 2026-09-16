#!/usr/bin/env node
// Real Electron + preload + shared renderer, with an isolated local relay/profile.
// Run after build:renderer, under xvfb-run on Linux CI. No hosted account or game.
import { _electron as electron, expect } from '../../admin-dashboard/node_modules/playwright/test.mjs';
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = await mkdtemp(`${tmpdir()}/fcm-usability-`);
const artifacts = resolve(root, 'test-results/overlay-usability');
const channels = [{ id: 'fo76', name: 'Fallout 76', parentId: null, color: '#F5CB5B', children:
  ['General', 'Trading', 'Events'].map(name => ({ id: name.toLowerCase(), name, parentId: 'fo76', color: '#F5CB5B' })),
}];
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  let data = [];
  if (path === '/api/users') data = { token: 'fixture-only-session', userId: 'alice', username: 'Alice', displayName: 'Alice', discordLinked: true, role: 'admin' };
  else if (path === '/api/channels') data = channels;
  else if (path === '/api/block') data = { blocked: [] };
  else if (path.startsWith('/api/parties/invites')) data = { invites: [] };
  else if (path.startsWith('/api/parties')) data = { parties: [] };
  else if (path.includes('/discord-status/')) data = { linked: true, discordUsername: 'Alice' };
  else if (path.includes('/steam-status/')) data = { linked: false };
  else if (path === '/api/version') data = { version: '1.4.0' };
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ data }));
});
const relay = new WebSocketServer({ server });
let connectionCount = 0;
relay.on('connection', socket => {
  connectionCount++;
  socket.on('message', raw => {
    const frame = JSON.parse(raw.toString());
    if (frame.type === 'chat:history') {
      const channelId = frame.payload.channelId;
      socket.send(JSON.stringify({ type: 'chat:history', payload: { messages: Array.from({ length: 80 }, (_, index) => ({
        id: `${channelId}-${index}`, channel_id: channelId, user_id: 'bob', username: 'Bob',
        content: `${channelId} message ${index}: readable chat`, source: 'game',
        created_at: new Date(Date.UTC(2026, 8, 16, 12, index)).toISOString(),
      })) } }));
    }
  });
});

let app;
let page;
const errors = [];
try {
  await rm(artifacts, { recursive: true, force: true });
  await mkdir(artifacts, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await writeFile(`${profile}/overlay-state.json`, JSON.stringify({
    installToken: 'usability-fixture-only', username: 'Alice', displayName: 'Alice',
    discordLinked: true, userRole: 'admin', settings: { onboarded: true, fadeWhenIdle: false, fontSize: 14 },
  }));
  const env = { ...process.env, BUILD_CHANNEL: 'stable', APP_CLIENT_KEY: 'fixture-only-client',
    RELAY_HTTP: `http://127.0.0.1:${port}`, RELAY_WS: `ws://127.0.0.1:${port}/ws`,
    XDG_CURRENT_DESKTOP: '', XDG_SESSION_DESKTOP: '', XDG_SESSION_TYPE: 'x11',
  };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'APPIMAGE', 'APPDIR', 'RENDERER_URL', 'WAYLAND_DISPLAY',
    'OVERLAY_SHOT', 'OVERLAY_FIRE', 'DEV_PERSONA_LOGIN_SECRET']) delete env[key];
  async function launch() {
    app = await electron.launch({
      executablePath: `${root}/node_modules/electron/dist/electron`,
      args: [root, `--user-data-dir=${profile}`, '--ozone-platform=x11', '--no-sandbox'],
      env, timeout: 30_000,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(10_000);
    page.on('pageerror', error => errors.push(error.message));
    await page.getByText('general message 79: readable chat', { exact: true }).waitFor();
  }
  const command = value => app.evaluate(({ BrowserWindow }, cmd) => BrowserWindow.getAllWindows()[0].webContents.send('overlay:command', cmd), value);
  const composer = () => page.locator('[contenteditable="true"]').first();
  await launch();
  const initialConnections = connectionCount;
  await composer().fill('draft survives appearance changes');
  await page.evaluate(() => { window.usabilityComposer = document.querySelector('[contenteditable="true"]'); });
  await command('settings:open');
  await page.locator('.ss-navbtn').filter({ hasText: /appearance/i }).click();
  const fontButton = page.getByRole('button', { name: 'Chat font', exact: true });
  await fontButton.press('ArrowDown');
  await page.getByRole('option', { name: 'Verdana', exact: true }).click();
  await expect(fontButton).toContainText('Verdana');
  await expect(composer()).toHaveCSS('font-family', /Verdana/);
  await expect(composer()).toHaveText('draft survives appearance changes');
  assert.equal(await page.evaluate(() => window.usabilityComposer === document.querySelector('[contenteditable="true"]')), true, 'font choice must retain the composer node');
  assert.equal(connectionCount, initialConnections, 'font choice must not reconnect');

  // Change color theme independently, using the real custom popover.
  await page.locator('.ss-select-btn').first().click();
  await page.locator('.ss-select-item').filter({ hasText: /^White$/ }).click();
  await expect(composer()).toHaveCSS('font-family', /Verdana/);
  await page.screenshot({ path: `${artifacts}/font-picker.png` });
  await fontButton.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.locator('#shell-settings-backdrop')).toHaveClass(/open/);
  await expect(fontButton).toBeFocused();
  await page.keyboard.press('Escape');

  for (const name of ['Trading', 'Events', 'General']) {
    await command('channel:next');
    await expect(page).toHaveTitle(new RegExp(name));
  }
  assert.equal(connectionCount, initialConnections, 'navigation must not reconnect');
  console.log('PASS live font/theme changes and one-step navigation retain chat, draft and socket');

  // A same-account metadata refresh must not remount or erase drafts.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('relay:status', {
    state: 'authenticated', displayName: 'Alice renamed', role: null,
  }));
  await expect(composer()).toHaveText('draft survives appearance changes');
  assert.equal(connectionCount, initialConnections);

  // Wait for startup pinning, then read older messages during recoveries.
  await expect.poll(() => page.evaluate(() => {
    const row = document.querySelector('[data-fcm-message-line]');
    const list = row?.closest('.fcm-scrollbar');
    return !!list && list.scrollHeight > list.clientHeight;
  })).toBe(true);
  await page.evaluate(() => {
    const list = document.querySelector('[data-fcm-message-line]').closest('.fcm-scrollbar');
    window.usabilityList = list;
    list.scrollTop = 150;
    list.dispatchEvent(new Event('scroll'));
    window.usabilityAnchor = [...list.querySelectorAll('[data-fcm-message-line]')]
      .find(row => row.getBoundingClientRect().top >= list.getBoundingClientRect().top);
    window.usabilityAnchorOffset = window.usabilityAnchor.getBoundingClientRect().top - list.getBoundingClientRect().top;
  });
  // Catch deferred navigation/layout callbacks before introducing a disconnect.
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.usabilityList.scrollTop), 150, 'deferred layout work must respect a reader scrolling up');
  for (let index = 0; index < 10; index++) {
    const before = connectionCount;
    for (const socket of relay.clients) socket.terminate();
    // Preserve the production reconnect backoff (up to 30s plus jitter).
    await expect.poll(() => connectionCount, { timeout: 35_000 }).toBe(before + 1);
    await expect(page.getByText('general message 79: readable chat', { exact: true })).toHaveCount(1);
    await expect(composer()).toHaveText('draft survives appearance changes');
    await expect(page).toHaveTitle(/General/);
    const anchorShift = await page.evaluate(() => window.usabilityAnchor.getBoundingClientRect().top
      - window.usabilityList.getBoundingClientRect().top - window.usabilityAnchorOffset);
    assert.ok(Math.abs(anchorShift) <= 1, `recovery must retain the visible message anchor (shift=${anchorShift})`);
  }
  console.log('PASS ten real relay disconnects retain messages, selected tab, draft and reading position');

  await expect.poll(async () => JSON.parse(await readFile(`${profile}/overlay-state.json`, 'utf8')).settings.fontId).toBe('verdana');
  await app.close(); app = null;
  // Exercise the durable native preference fallback, not merely localStorage.
  await rm(`${profile}/Local Storage`, { recursive: true, force: true });
  await launch();
  await expect(composer()).toHaveCSS('font-family', /Verdana/);
  console.log('PASS native preference persistence after restart and localStorage removal');

  for (const [size, width] of [[9, 320], [14, 520], [22, 800]]) {
    await command('settings:open');
    await page.locator('.ss-navbtn').filter({ hasText: /appearance/i }).click();
    const scale = page.getByText('Scale (font size)', { exact: true }).locator('..').locator('input[type="range"]');
    await scale.evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, size);
    await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setSize(width, 500), width);
    await expect(composer()).toBeVisible();
    await expect(composer()).toHaveCSS('font-family', /Verdana/);
    const layout = await composer().evaluate(input => {
      const box = input.getBoundingClientRect();
      return { left: box.left, right: box.right, bottom: box.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.viewportWidth + 1 && layout.bottom <= layout.viewportHeight + 1,
      `composer must stay within the viewport at scale ${size}`);
    await page.screenshot({ path: `${artifacts}/font-scale-${size}.png` });
  }
  console.log('PASS font scales 9/14/22 at narrow/default/wide bounds retain a visible composer');

  // The real account boundary still discards the old component and its draft.
  await composer().fill('private draft from Alice');
  await page.evaluate(() => { window.usabilityComposer = document.querySelector('[contenteditable="true"]'); });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('relay:status', {
    state: 'authenticated', userId: 'bob', displayName: 'Bob', role: 'user',
  }));
  await expect(composer()).toHaveText('');
  assert.equal(await page.evaluate(() => window.usabilityComposer === document.querySelector('[contenteditable="true"]')), false);
  console.log('PASS account switch discards the previous composer and private draft');
  assert.deepEqual(errors, [], 'renderer exceptions');
  await writeFile(`${artifacts}/result.json`, JSON.stringify({
    status: 'passed', completedAt: new Date().toISOString(), disconnects: 10,
    fontScales: [9, 14, 22], widths: [320, 520, 800], rendererErrors: errors,
    checks: ['live-font-and-theme', 'one-step-navigation', 'same-account-update',
      'reading-anchor', 'native-preference-restart', 'composer-layout', 'account-switch-reset'],
  }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: `${artifacts}/failure.png` }).catch(() => {});
  const log = await readFile(`${profile}/logs/main.log`, 'utf8').catch(() => '');
  await writeFile(`${artifacts}/main.log`, log);
  console.error(errors);
  throw error;
} finally {
  if (app) await app.close();
  for (const socket of relay.clients) socket.terminate();
  await new Promise(resolve => relay.close(resolve));
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
  console.log('Teardown: owned Electron, local relay and temporary profile removed');
}
