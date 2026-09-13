import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const main = readFileSync(join(ROOT, 'main.js'), 'utf8');

describe('overlay QA login flow', () => {
  it('opens the QA OAuth start URL', () => {
    expect(main).toMatch(/\/auth\/discord\/qa\/start\?installToken=/);
  });
  it('polls the qa-status endpoint with the client version header', () => {
    expect(main).toMatch(/\/api\/auth\/qa-status\//);
    const pollRegion = main.slice(main.indexOf('qa-status/'), main.indexOf('qa-status/') + 800);
    expect(pollRegion).toMatch(/X-Client-Version/);
  });
  it('handles a 426 outdated-build response from the poll', () => {
    expect(main).toMatch(/426/);
  });
  it('auto-starts QA login on the qa channel', () => {
    expect(main).toMatch(/BUILD_CHANNEL === 'qa' && !IS_PORTABLE/);
  });
  it('portable QA restores its linked install identity before requiring OAuth', () => {
    const fallback = main.slice(main.indexOf("if (BUILD_CHANNEL === 'qa' && IS_PORTABLE"), main.indexOf("if (BUILD_CHANNEL === 'qa' && IS_PORTABLE") + 300);
    expect(fallback).toMatch(/startQaLogin\(\);/);
    expect(main).toMatch(/BUILD_CHANNEL === 'qa' && !IS_PORTABLE/);
  });
  it('starts the normal token-registration path for portable QA on startup', () => {
    const startup = main.slice(main.indexOf("if (BUILD_CHANNEL === 'qa' && !IS_PORTABLE"), main.indexOf("if (BUILD_CHANNEL === 'qa' && !IS_PORTABLE") + 180);
    expect(startup).toMatch(/else \{\s*startRelay\(\);/);
  });
  it('registers an overlay:qa-login IPC handler', () => {
    expect(main).toMatch(/ipcMain\.(on|handle)\('overlay:qa-login'/);
  });
});
