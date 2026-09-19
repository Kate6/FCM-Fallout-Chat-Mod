import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import foreground from '../windows-foreground-script.js';
import core from '../overlay-core.js';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const fresh = between('function hasFreshWindowsGamePresence()', 'let _scanCount');
const scanner = between('function scanForGame()', 'function onGamePresenceChanged(');
function setupScanner() {
  const callbacks = [];
  const context = { process: { platform: 'win32' }, Date: { now: () => 10000 },
    zorderProc: {}, fgFailClosed: false, lastWindowsGamePresenceAt: 0, windowsGameScanPending: false,
    isGamePresenceFresh: foreground.isGamePresenceFresh, GAME_PROCESSES: core.GAME_PROCESSES,
    exec: vi.fn((command, options, callback) => callbacks.push(callback)), onGamePresenceChanged: vi.fn() };
  vm.runInNewContext(`${fresh}\n${scanner}\nglobalThis.scan=scanForGame;`, context);
  return { context, callbacks };
}
it('skips short-lived scanners only while a healthy native observation is fresh', () => {
  const { context } = setupScanner();
  context.lastWindowsGamePresenceAt = 9000; context.scan(); expect(context.exec).not.toHaveBeenCalled();
  context.fgFailClosed = true; context.scan(); expect(context.exec).toHaveBeenCalledTimes(2);
});
it('bounds fallback concurrency and treats failure as unknown, not a game exit', () => {
  const { context, callbacks } = setupScanner();
  context.scan(); context.scan(); expect(callbacks).toHaveLength(2);
  callbacks[0](Error('timeout'), ''); callbacks[1](null, 'No tasks');
  expect(context.onGamePresenceChanged).toHaveBeenCalledExactlyOnceWith(null);
  context.scan(); expect(callbacks).toHaveLength(4);
  callbacks[2](null, '"Fallout76.exe"'); callbacks[3](Error('timeout'), '');
  expect(context.onGamePresenceChanged).toHaveBeenLastCalledWith(true);
});
it('does not let a late fallback overwrite a newer native sample', () => {
  const { context, callbacks } = setupScanner(); context.scan();
  context.lastWindowsGamePresenceAt = 10000;
  callbacks[0](null, 'No tasks'); callbacks[1](null, 'No tasks');
  expect(context.onGamePresenceChanged).not.toHaveBeenCalled();
  context.zorderProc = null; context.scan(); expect(callbacks).toHaveLength(4);
});
it('reports a confirmed absence through the existing presence reducer', () => {
  const { context, callbacks } = setupScanner(); context.scan();
  callbacks[0](null, 'No tasks'); callbacks[1](null, 'No tasks');
  expect(context.onGamePresenceChanged).toHaveBeenCalledExactlyOnceWith(false);
});
it('clears cached presence on worker exit so fallback discovery can resume', () => {
  const context = { zorderProc: {}, lastWindowsGamePresenceAt: 9000, isQuitting: false,
    overlayCore: core, Date: { now: () => 10000 }, pollerStartedAt: 1000, pollerEverEmitted: true,
    pollerRestartCount: 0, pollerRestartTimer: null, diag: vi.fn(), setTimeout: vi.fn(), clearTimeout: vi.fn() };
  const down = between('function handleWindowsPollerDown(', '// Fail-safe watchdog (win32)');
  vm.runInNewContext(`${down}\nhandleWindowsPollerDown('exit', 1);`, context);
  expect(context.zorderProc).toBe(null); expect(context.lastWindowsGamePresenceAt).toBe(0);
  expect(context.setTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);
});
it('routes fragmented native presence separately from foreground watchdog/keybind updates', () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.pid = 55;
  let now = 10000;
  const context = { process: { platform: 'win32', pid: 1234 }, isQuitting: false,
    buildForegroundScript: foreground.buildForegroundScript, parseGamePresenceLine: foreground.parseGamePresenceLine,
    Date: { now: () => now }, spawn: () => child, diag: vi.fn(), onGamePresenceChanged: vi.fn(),
    lastWindowsGamePresenceAt: 9999, handleWindowsPollerDown: vi.fn(), fgFailClosed: false,
    isGameClass: () => false, overlayCore: core, cancelGameFocusReturn: vi.fn(), gameRunning: false,
    applyFocusClickThrough: vi.fn(), refreshShortcuts: vi.fn() };
  const poller = between('function spawnWindowsForegroundPoller()', '// Relaunch the win32 poller');
  vm.runInNewContext(`${poller}\nspawnWindowsForegroundPoller();`, context);
  expect(context.lastWindowsGamePresenceAt).toBe(0);
  now = 11000; child.stdout.emit('data', 'FCM_GAME_RUN'); child.stdout.emit('data', 'NING=1\n');
  expect(context.onGamePresenceChanged).toHaveBeenCalledExactlyOnceWith(true);
  expect(context.lastWindowsGamePresenceAt).toBe(11000);
  expect(context.lastForegroundAt).toBe(10000);
  expect(context.refreshShortcuts).not.toHaveBeenCalled();
  child.stdout.emit('data', 'FCM_GAME_RUNNING=?\n'); expect(context.lastWindowsGamePresenceAt).toBe(0);
  expect(context.onGamePresenceChanged).toHaveBeenCalledTimes(1);
  child.stdout.emit('data', 'FCM_OWNER_PID=99\nnotepad\n');
  expect(context.refreshShortcuts).toHaveBeenCalledOnce();
  expect(context.cancelGameFocusReturn).toHaveBeenCalledWith('windows-other-foreground', 99);
});
