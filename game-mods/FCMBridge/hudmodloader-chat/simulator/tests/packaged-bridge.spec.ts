import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function pollCount(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('polls' in value) || typeof value.polls !== 'number') return -1;
  return value.polls;
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.__FCM_SIM_TEARDOWN__?.()).catch(() => undefined);
  await expect(page.locator('#ruffle-player')).toHaveCount(0);
});

test('isolated host cannot link production helpers and tests exact packaged bytes', async () => {
  const host = await readFile(new URL('../packaged-bridge.hxml', import.meta.url), 'utf8');
  expect(host).not.toContain('--class-path ..');
  const bytes = await readFile(new URL('../public/FCMServerBridge.swf', import.meta.url));
  const manifest: unknown = JSON.parse(await readFile(new URL('../public/bridge-manifest.json', import.meta.url), 'utf8'));
  expect(manifest).toMatchObject({ target: 'dev', swfSha256: createHash('sha256').update(bytes).digest('hex') });
  const hostBytes = await readFile(new URL('../public/PackagedBridgeHost.swf', import.meta.url));
  // FCMServerBridge is only an assertion string; no other production definitions may be supplied.
  for (const symbol of ['FcmRoster', 'FcmHudRosterReader', 'FcmBridgeState', 'FcmNativeApi', 'FCMChatWidget']) {
    expect(hostBytes.includes(Buffer.from(symbol)), symbol).toBe(false);
  }
});

for (const provider of ['xscal', 'zfe']) {
  test(`loads isolated packaged bridge through ${provider}, confirms room and tears down`, async ({ page }) => {
    test.setTimeout(40_000);
    const errors: string[] = [];
    await page.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== 'http://127.0.0.1:41739') {
        errors.push('Unexpected nonlocal request'); await route.abort(); return;
      }
      await route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    const snapshot = () => page.evaluate(() => window.__FCM_SIM__?.packaged('snapshot'));
    await page.goto(`/?mode=packaged-bridge&provider=${provider}`);
    await expect(page.locator('#log')).toContainText(`PACKAGED loaded provider=${provider} isolated=true`);
    await expect.poll(snapshot, { timeout: 15_000 }).toMatchObject({ isolated: true, connected: true,
      bound: true, controls: 1, subscriptions: 8, acceptedNames: true, violation: false });
    await page.evaluate(() => window.__FCM_SIM__?.packaged('loading'));
    // Wait for real production poll ticks, not private-state calls or patched clocks.
    const before: unknown = await snapshot();
    expect(before).toMatchObject({ controls: 1, leaves: 0 });
    await expect.poll(async () => pollCount(await snapshot())).toBeGreaterThan(pollCount(before) + 4);
    expect(await snapshot()).toMatchObject({ controls: 1, leaves: 0 });
    await page.evaluate(() => window.__FCM_SIM__?.packaged('resume'));
    const resumed = pollCount(await snapshot());
    await expect.poll(async () => pollCount(await snapshot())).toBeGreaterThan(resumed + 4);
    await expect.poll(snapshot).toMatchObject({ bound: true, controls: 1, leaves: 0, rebound: false });
    await page.evaluate(() => window.__FCM_SIM__?.packaged('hop'));
    await expect.poll(snapshot, { timeout: 10_000 }).toMatchObject({ bound: true, controls: 2, leaves: 1,
      rebound: true, acceptedNames: true, violation: false });
    await page.evaluate(() => window.__FCM_SIM__?.packaged('main-menu'));
    await expect.poll(snapshot, { timeout: 10_000 }).toMatchObject({ bound: false, controls: 2, leaves: 2 });
    const stopped = await page.evaluate(() => window.__FCM_SIM__?.packaged('unload'));
    expect(stopped).toMatchObject({ disposed: true, connected: false, subscriptions: 0, disconnects: 1, violation: false });
    // Observe more than two production 500 ms timer periods after removal.
    await page.waitForTimeout(1200);
    expect(await snapshot()).toEqual(stopped);
    expect(errors).toEqual([]);
  });

  test(`rejects unready cross-domain roster and recovers through ${provider}`, async ({ page }) => {
    await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:41739'
      ? route.continue() : route.abort());
    const snapshot = () => page.evaluate(() => window.__FCM_SIM__?.packaged('snapshot'));
    await page.goto(`/?mode=packaged-bridge&provider=${provider}&scenario=packaged-unready`);
    await expect(page.locator('#log')).toContainText(`PACKAGED loaded provider=${provider} isolated=true`);
    await expect.poll(async () => pollCount(await snapshot())).toBeGreaterThan(5);
    expect(await snapshot()).toMatchObject({ connected: true, subscriptions: 8, controls: 0, bound: false, violation: false });
    await page.evaluate(() => window.__FCM_SIM__?.packaged('resume'));
    await expect.poll(snapshot, { timeout: 10_000 }).toMatchObject({ controls: 1, bound: true, acceptedNames: true, violation: false });
  });
}
