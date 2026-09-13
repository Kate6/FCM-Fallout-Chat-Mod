import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const main = readFileSync(join(ROOT, 'main.js'), 'utf8');

function region(start, end) {
  return main.slice(main.indexOf(start), main.indexOf(end));
}

describe('overlay OAuth browser handoff', () => {
  it('opens standard Discord OAuth in the operating-system browser', () => {
    const discordLink = region("ipcMain.on('discord:link'", "ipcMain.on('steam:link'");
    expect(discordLink).toMatch(/shell\.openExternal\(linkUrl\)/);
    expect(discordLink).not.toMatch(/new BrowserWindow/);
  });

  it('polls for Discord completion for the backend OAuth-state lifetime', () => {
    expect(main).toMatch(/DISCORD_OAUTH_POLL_ATTEMPTS\s*=\s*200/);
    expect(main).toMatch(/refreshDiscordStatus\(0,\s*\{\s*waitForLink:\s*true/);
  });

  it('opens QA Discord OAuth in the operating-system browser', () => {
    const qaLogin = region('function startQaLogin()', 'function pollQaStatus(');
    expect(qaLogin).toMatch(/shell\.openExternal\(startUrl\)/);
    expect(qaLogin).not.toMatch(/new BrowserWindow/);
    expect(qaLogin).toMatch(/pollQaStatus\(0\)/);
  });
});
