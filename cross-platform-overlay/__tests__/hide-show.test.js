import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import core from '../overlay-core.js';

// Execute the production window actions with an Electron adapter. No app startup,
// game process, or host window is touched by these regressions.
const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
function productionFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`Missing production function ${name}`);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

function harness({ gameRunning = true, foreground = 'Fallout76' } = {}) {
  let visible = true;
  let focused = false;
  const context = vm.createContext({
    gameRunning, lastForegroundProc: foreground, userHidden: false,
    overlayCore: core, process: { platform: 'win32' },
    foregroundDetect: true, gameFocused: gameRunning,
    diag: vi.fn(), emitVisibility: vi.fn(), startRepaintTimer: vi.fn(), stopRepaintTimer: vi.fn(),
    sendToRenderer: vi.fn(), refreshShortcuts: vi.fn(), cancelGameFocusReturn: vi.fn(),
    returnFocusToGame: vi.fn(() => { focused = false; }),
    mainWindow: {
      isVisible: () => visible, isMinimized: () => false,
      isFocused: () => focused, isDestroyed: () => false,
      setFocusable: vi.fn(), restore: vi.fn(),
      hide: vi.fn(() => { visible = false; focused = false; }),
      show: vi.fn(() => { visible = true; focused = true; }),
      showInactive: vi.fn(() => { visible = true; }),
    },
  });
  for (const name of ['_doShow', 'showWindowInactive', 'hideWindow', 'hideWindowUserExplicit', 'toggleWindow']) {
    vm.runInContext(productionFunction(name), context);
  }
  return { context, focusOverlay: () => { focused = true; } };
}

describe('keyboard hide/show', () => {
  it('restores visibility without taking game focus over 20 cycles', () => {
    const { context: c } = harness();
    for (let i = 0; i < 20; i++) {
      c.toggleWindow();
      expect(c.userHidden).toBe(true);
      expect(c.mainWindow.isVisible()).toBe(false);
      c.toggleWindow();
      expect(c.userHidden).toBe(false);
      expect(c.mainWindow.isVisible()).toBe(true);
      expect(c.mainWindow.isFocused()).toBe(false);
    }
    expect(c.mainWindow.showInactive).toHaveBeenCalledTimes(20);
  });

  it('hands control back before hiding an overlay used for typing', () => {
    const { context: c, focusOverlay } = harness();
    focusOverlay();
    c.hideWindowUserExplicit();
    expect(c.returnFocusToGame).toHaveBeenCalledTimes(1);
    expect(c.returnFocusToGame.mock.invocationCallOrder[0]).toBeLessThan(c.mainWindow.hide.mock.invocationCallOrder[0]);
    expect(c.userHidden).toBe(true);
  });

  it('does not activate the game when another app owns focus', () => {
    const { context: c } = harness({ foreground: 'firefox' });
    c.hideWindowUserExplicit();
    expect(c.returnFocusToGame).not.toHaveBeenCalled();
  });

  it('retains an activating restore for standalone use', () => {
    const { context: c } = harness({ gameRunning: false, foreground: 'firefox' });
    c.toggleWindow();
    c.toggleWindow();
    expect(c.mainWindow.show).toHaveBeenCalledOnce();
    expect(c.returnFocusToGame).not.toHaveBeenCalled();
  });
});

describe('owned focus-return helper', () => {
  afterEach(() => vi.useRealTimers());
  function focusHarness() {
    vi.useFakeTimers();
    const children = [];
    const c = vm.createContext({
      pendingGameFocusReturn: null, gameRunning: true, IS_LINUX: false,
      windowsFocusWorker: { cancel: vi.fn(), request: vi.fn() },
      process: { platform: 'win32', pid: 1234 }, clickThrough: true, modalInteractive: false,
      mainWindow: { isDestroyed: () => false, isFocused: () => true, blur: vi.fn() },
      sendToRenderer: vi.fn(), diag: vi.fn(), setMouseIgnore: vi.fn(), setTimeout, clearTimeout,
      spawn: vi.fn(() => {
        const child = new EventEmitter();
        child.kill = vi.fn();
        children.push(child);
        return child;
      }),
    });
    for (const name of ['cancelGameFocusReturn', 'returnFocusToGame']) vm.runInContext(productionFunction(name), c);
    return { c, children };
  }

  it('cancels only its own pending helper and bounds an unresponsive attempt', () => {
    const { c, children } = focusHarness();
    c.returnFocusToGame();
    expect(c.sendToRenderer).toHaveBeenCalledWith('overlay:blur-input');
    expect(c.setMouseIgnore).toHaveBeenCalledWith(true, true);
    c.cancelGameFocusReturn();
    expect(c.windowsFocusWorker.cancel).toHaveBeenCalled();
    c.returnFocusToGame();
    expect(c.windowsFocusWorker.request).toHaveBeenCalledTimes(2);
    expect(children).toHaveLength(0);
  });

  it('does not spawn or blur when the game stopped or another window owns focus', () => {
    const { c } = focusHarness();
    c.gameRunning = false;
    c.returnFocusToGame();
    c.gameRunning = true;
    c.mainWindow.isFocused = () => false;
    c.returnFocusToGame();
    expect(c.spawn).not.toHaveBeenCalled();
    expect(c.mainWindow.blur).not.toHaveBeenCalled();
  });
});
