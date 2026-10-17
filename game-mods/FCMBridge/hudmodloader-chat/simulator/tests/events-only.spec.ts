import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

// Personal Events-only variant (-D events_only). Against a standard harness the
// scenario self-skips; against a variant harness it must PASS. Either way the
// shared suite stays green — run this spec against both harness builds.
for (const provider of ['xscal', 'zfe']) {
  test(`events-only variant locks to Events through ${provider}`, async ({ page }) => {
    await page.goto(`/?mode=harness&provider=${provider}&scenario=events-only`);
    await expect(page.locator('#log')).toContainText(/EVENTS-ONLY-SCENARIO (PASS|FAIL|SKIP)/, { timeout: 25_000 });
    const log = await page.locator('#log').textContent();
    if (log?.includes('EVENTS-ONLY-SCENARIO SKIP')) {
      expect(log).toContain('EVENTS-ONLY-SCENARIO SKIP standard-build');
    } else {
      expect(log).toContain(`EVENTS-ONLY-SCENARIO PASS ${provider}`);
      expect(log).not.toContain('EVENTS-ONLY-SCENARIO FAIL');
    }
  });
}

test('events-only gates are present in the widget source', async () => {
  const widgetSource = await readFile(new URL('../../FCMChatWidget.hx', import.meta.url), 'utf8');
  // Compile-flag plumbing.
  expect(widgetSource).toContain('static inline var DEFAULT_CHAN:Int = 2;');
  // Single-tab lock.
  expect(widgetSource).toMatch(/function tabOrder\(\):Array<Int> \{[\s\S]*?return \[2\];/);
  // Ingest filter keeps protocol cursors but stores only Events rows.
  expect(widgetSource).toContain('if (channel != "events") continue;');
  // Editor never opens; submit backstop can never reach transport.
  expect(widgetSource).toMatch(/function openInput\(\):Void \{[\s\S]*?events_only[\s\S]*?return;/);
  expect(widgetSource).toContain('user send suppressed — events-only build');
  // Auto-broadcasts bypass both gates: hardcoded events leaf, direct native verb.
  expect(widgetSource).toContain('var chan:String = "events"; // global leaf');
  expect(widgetSource).toContain('_api.call("chat.v1.sendMessage", payload)');
});
