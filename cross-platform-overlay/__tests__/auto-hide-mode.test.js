// Regression contracts for the two idle auto-hide modes. These checks keep the
// renderer, preload bridge, native window, and Appearance UI on the same wire
// format without importing Electron from the unit-test process.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import core from '../overlay-core.js';

const here = (name) => readFileSync(resolve(import.meta.dirname, '..', name), 'utf8');

describe('full auto-hide wiring', () => {
  it('allows the native idle target below the ordinary resize minimum', () => {
    const bounds = core.clampToWorkArea(
      { x: 20, y: 20, width: 520, height: 1 },
      { x: 0, y: 0, width: 1920, height: 1080 },
      1,
    );
    expect(bounds.height).toBe(1);
    expect(bounds.y).toBe(20);
  });

  it('passes the full-hide flag from the renderer through preload to Electron', () => {
    const shell = here('src/shell.ts');
    const preload = here('preload.js');
    const main = here('main.js');

    expect(shell).toContain("window.relayBridge.collapse(h, true)");
    expect(shell).toContain("window.relayBridge.collapse(h, false)");
    expect(preload).toContain('collapse: (headerHeight, fullAutoHide = false)');
    expect(main).toContain("ipcMain.on('overlay:collapse', (_evt, { headerHeight, fullAutoHide }) => {");
    expect(main).toContain('collapseToHeader(headerHeight, !!fullAutoHide);');
    expect(main).not.toContain('shouldSuppressIdleCollapse');
    expect(main).toContain('const target = fullAutoHide ? FULL_AUTO_HIDE_HEIGHT : Math.max(24, Math.round(headerH));');
    expect(main).toContain('const FULL_AUTO_HIDE_HEIGHT = 1;');
  });

  it('hides the full renderer without using the user-hidden window path', () => {
    const shell = here('src/shell.ts');
    const html = here('index.html');
    const main = here('main.js');

    expect(shell).toContain("root?.classList.add('fcm-full-auto-hidden')");
    expect(shell).toContain("root?.classList.remove('fcm-full-auto-hidden')");
    expect(shell).toContain("document.documentElement.classList.add('fcm-full-auto-hidden')");
    expect(shell).toContain("document.documentElement.classList.remove('fcm-full-auto-hidden')");
    expect(shell).toContain("const overUi = fullAutoHidden || modalOpen");
    expect(html).toContain('#root.fcm-full-auto-hidden');
    expect(html).toContain('html.fcm-full-auto-hidden #shell-bg-dim');
    expect(html).not.toContain("#root.fcm-full-auto-hidden {\n        visibility: hidden !important;\n        pointer-events: none !important;");
    expect(main).toContain('live renderer can receive a message and request expansion');
    expect(main).not.toContain('collapseToHeader(headerH) {');
  });
});

describe('Appearance auto-hide mode controls', () => {
  it('defaults idle hiding off and hides full-window effects during collapse', () => {
    expect(here('src/shell.ts')).toContain('fadeWhenIdle: false,');
    const html = here('index.html');
    expect(html).toContain('html.fcm-full-auto-hidden body *');
    expect(html).toContain('body:has(#root.collapsed) #shell-bg-dim');
    expect(html).toContain('body:has(#root.collapsed) #shell-scanline');
    expect(html).toContain('body:has(#root.collapsed)::before');
    expect(html).toContain('body:has(#root.collapsed)::after');
    expect(html).toContain('html.fcm-full-auto-hidden body::before');
    expect(html).toContain('html.fcm-full-auto-hidden body::after');
  });
  it('renders both mutually exclusive mode choices and persists the setting', () => {
    const shell = here('src/shell.ts');

    expect(shell).toContain("'Auto-hide mode'");
    expect(shell).toContain("'SUB-TABS COLLAPSE'");
    expect(shell).toContain("'FULL AUTO-HIDE'");
    expect(shell).toContain('autoHideMode: AutoHideMode');
    expect(shell).toContain('s.autoHideMode = normalizeAutoHideMode(s.autoHideMode);');
    expect(shell).toContain('commit({ autoHideMode: mode })');
  });
});
