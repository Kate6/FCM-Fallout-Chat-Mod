#!/usr/bin/env node
// Real Electron renderer -> preload -> main IPC -> native window bounds.
// Uses the HUD harness's pinned Playwright, not game input or a hosted account.
import { _electron as electron } from '../../game-mods/FCMBridge/hudmodloader-chat/simulator/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profile = await mkdtemp(`${tmpdir()}/fcm-drag-test-`);
const server = createServer((_req, res) => {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end('{"error":"isolated drag test"}');
});
let app;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await writeFile(`${profile}/overlay-state.json`, JSON.stringify({
    installToken: 'drag-fixture-only', displayName: 'Drag fixture', settings: { onboarded: false },
  }));
  const env = { ...process.env, BUILD_CHANNEL: 'stable',
    RELAY_HTTP: `http://127.0.0.1:${port}`, RELAY_WS: `ws://127.0.0.1:${port}/ws` };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'APPIMAGE', 'APPDIR', 'RENDERER_URL',
    'OVERLAY_SHOT', 'OVERLAY_FIRE', 'DEV_PERSONA_LOGIN_SECRET']) delete env[key];
  app = await electron.launch({
    executablePath: `${root}/node_modules/electron/dist/electron`,
    args: [root, `--user-data-dir=${profile}`, '--ozone-platform=x11', ...(process.env.CI ? ['--no-sandbox'] : [])],
    env, timeout: 30_000,
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10_000);
  await page.waitForSelector('#shell-linux-nodrag', { state: 'attached' });
  await page.evaluate(() => {
    window.dragSmokeSamples = [];
    document.addEventListener('pointermove', e => {
      if (e.buttons === 1) window.dragSmokeSamples.push({ x:e.clientX, y:e.clientY, sx:e.screenX, sy:e.screenY, mx:e.movementX, my:e.movementY });
    });
  });
  const bounds = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
  const gesture = async (selector, shouldMove) => {
    const target = page.locator(selector).first();
    await target.waitFor({ state: 'visible' });
    // Allow the modal-fit geometry write before taking the native starting bounds.
    await page.waitForTimeout(200);
    const box = await target.boundingBox();
    const before = await bounds();
    await page.evaluate(() => { window.dragSmokeSamples = []; });
    await page.mouse.move(box.x + Math.min(25, box.width / 2), box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + Math.min(25, box.width / 2) + 30, box.y + box.height / 2 + 10, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await bounds();
    const moved = Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 3;
    if (moved !== shouldMove) {
      const log = await readFile(`${profile}/logs/main.log`, 'utf8').catch(() => '');
      console.log(log.split('\n').filter(line => /\[(drag|move|click-through)\]/.test(line)).slice(-12).join('\n'));
      console.log(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x: box.x + 25, y: box.y + box.height / 2 }));
      console.log(await page.evaluate(() => window.dragSmokeSamples));
    }
    assert.equal(moved, shouldMove, `${selector}: native movement=${moved}, expected=${shouldMove}; before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    console.log(`PASS ${selector} native-window-${shouldMove ? 'moved' : 'stationary'}`);
  };
  await page.evaluate(() => {
    document.querySelectorAll('#shell-settings-backdrop, #shell-onboarding-backdrop').forEach(el => el.classList.remove('open'));
  });
  await gesture('#shell-bar .shell-drag', true);
  // This fixture mirrors the shared ChatOverlay header's inline app-region contract.
  // It avoids requiring real login/chat data; modal tests below use actual shell DOM.
  await page.evaluate(() => {
    const header = document.createElement('div');
    header.id = 'drag-smoke-header';
    header.style.cssText = 'position:fixed;top:30px;left:20px;width:360px;height:40px;z-index:20000;background:#777;-webkit-app-region:drag';
    header.innerHTML = '<span id="drag-smoke-control" style="-webkit-app-region:no-drag;display:inline-block;width:90px">Control</span><span id="drag-smoke-space" style="display:inline-block;width:180px;height:35px">Header space</span>';
    document.body.appendChild(header);
  });
  await gesture('#drag-smoke-space', true);
  await gesture('#drag-smoke-control', false);
  await page.evaluate(() => {
    document.getElementById('drag-smoke-header').remove();
  });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('overlay:command', 'settings:open'));
  await gesture('#shell-settings .ss-title', true);
  await page.keyboard.press('Escape');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('relay:status', {
    state: 'authenticated', displayName: 'Drag fixture', discordLinked: true, role: 'admin',
  }));
  await gesture('#shell-onboarding .ob-title', true);
} finally {
  if (app) await app.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true });
  console.log('Teardown: owned Electron, local relay and temporary profile removed');
}
