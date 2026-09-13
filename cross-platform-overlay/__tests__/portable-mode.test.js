import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import core from '../overlay-core.js';

const created = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcm-portable-test-'));
  created.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('portable layout', () => {
  it('leaves installed builds unchanged', () => {
    expect(core.resolvePortableLayout({ enabled: false })).toEqual({ enabled: false });
  });

  it('uses PORTABLE_EXECUTABLE_DIR on Windows', () => {
    const root = path.resolve('/portable/fcm');
    const result = core.resolvePortableLayout({
      enabled: true, platform: 'win32', env: { PORTABLE_EXECUTABLE_DIR: root }, execPath: '/temp/app.exe',
    }, path);
    expect(result.root).toBe(root);
    expect(result.dataRoot).toBe(path.join(root, 'FCMData'));
    expect(result.sessionData).toBe(path.join(root, 'FCMData', 'Session'));
  });

  it('uses the persistent AppImage folder on Linux', () => {
    const root = tempDir();
    const appImage = path.join(root, 'FCM.AppImage');
    const result = core.resolvePortableLayout({
      enabled: true, platform: 'linux', env: { APPIMAGE: appImage }, execPath: '/tmp/.mount_FCM/app',
    }, path);
    expect(result.root).toBe(root);
  });

  it('supports an unpacked Linux folder', () => {
    const root = tempDir();
    const result = core.resolvePortableLayout({
      enabled: true, platform: 'linux', env: {}, execPath: path.join(root, 'fallout-chat-mod'),
    }, path);
    expect(result.root).toBe(root);
  });

  it('ignores a parent launcher APPIMAGE for an unpacked Linux executable', () => {
    const root = tempDir();
    const result = core.resolvePortableLayout({
      enabled: true,
      platform: 'linux',
      env: { APPIMAGE: '/home/user/Applications/Host.AppImage' },
      execPath: path.join(root, 'fallout-chat-mod'),
    }, path);
    expect(result.root).toBe(root);
  });

  it('fails closed for a transient AppImage mount without APPIMAGE', () => {
    expect(core.resolvePortableLayout({
      enabled: true, platform: 'linux', env: {}, execPath: '/tmp/.mount_FCM123/fallout-chat-mod',
    }, path)).toEqual({ enabled: true, error: 'stable AppImage path unavailable' });
  });

  it('uses APPIMAGE during extract-and-run', () => {
    const root = tempDir();
    const appImage = path.join(root, 'FCM.AppImage');
    const result = core.resolvePortableLayout({
      enabled: true,
      platform: 'linux',
      env: { APPIMAGE: appImage },
      execPath: '/tmp/appimage_extracted_abc123/fallout-chat-mod',
    }, path);
    expect(result.root).toBe(root);
  });

  it('creates and validates a writable contained data directory', () => {
    const root = tempDir();
    const layout = core.resolvePortableLayout({
      enabled: true, platform: 'linux', env: {}, execPath: path.join(root, 'app'),
    }, path);
    expect(core.validatePortableLayout(fs, layout, path)).toEqual({ ok: true });
    expect(fs.statSync(layout.dataRoot).isDirectory()).toBe(true);
    expect(fs.readdirSync(layout.dataRoot)).toEqual([]);
  });

  it('rejects a symlinked FCMData directory', () => {
    const root = tempDir();
    const outside = tempDir();
    fs.symlinkSync(outside, path.join(root, 'FCMData'), 'dir');
    const layout = core.resolvePortableLayout({
      enabled: true, platform: 'linux', env: {}, execPath: path.join(root, 'app'),
    }, path);
    expect(core.validatePortableLayout(fs, layout, path)).toEqual({
      ok: false, error: 'FCMData must not be a symbolic link',
    });
  });
});

describe('atomic portable writes', () => {
  it('replaces a durable file without leaving its temporary file', () => {
    const root = tempDir();
    const target = path.join(root, 'overlay-state.json');
    fs.writeFileSync(target, 'old');
    core.atomicWriteFileSync(fs, target, 'new');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
    expect(fs.readdirSync(root)).toEqual(['overlay-state.json']);
  });
});

describe('main-process ordering guards', () => {
  const source = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');

  it('configures portable paths before logging and state constants', () => {
    const setPath = source.indexOf("app.setPath('userData'");
    expect(setPath).toBeGreaterThan(-1);
    expect(setPath).toBeLessThan(source.indexOf('function diagPath()'));
    expect(setPath).toBeLessThan(source.indexOf('const STATE_FILE'));
    expect(setPath).toBeLessThan(source.indexOf('app.requestSingleInstanceLock()'));
  });

  it('disables migration and auto-launch in portable mode', () => {
    expect(source).toContain("diag('[migrate] portable mode — installed profile migration disabled')");
    expect(source).toContain("if (IS_PORTABLE || !app.isPackaged || process.platform === 'linux') return;");
  });
});
