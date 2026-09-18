import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect, vi, afterEach } from 'vitest';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
function harness() {
  let bounds = { x: 20, y: 30, width: 520, height: 500 };
  let min = 280, max = 100000;
  const frames = [];
  const context = vm.createContext({
    Date, setInterval, clearInterval, diag() {}, movingActive: false,
    collapsed: false, collapseAnim: null, collapseAnimTarget: null,
    expandedBounds: null, expandedHeight: 500,
    MIN_WIDTH: 300, MIN_HEIGHT: 280, DEFAULT_HEIGHT: 500, FULL_AUTO_HIDE_HEIGHT: 1,
    dispatchFocusInput() {},
    mainWindow: {
      isDestroyed: () => false, isFocused: () => false, focus() {},
      getBounds: () => ({ ...bounds }),
      setMinimumSize: (_w, h) => { min = h; bounds.height = Math.max(min, bounds.height); },
      setMaximumSize: (_w, h) => { max = h; bounds.height = Math.min(max, bounds.height); },
    },
    setWindowBoundsGuarded: b => { bounds = { ...b, height: Math.max(min, Math.min(max, b.height)) }; frames.push(bounds.height); },
  });
  vm.runInContext(source.slice(source.indexOf('function animateHeightTo('), source.indexOf('// ─── Tray menu rebuild')), context);
  return { call: code => vm.runInContext(code, context), bounds: () => bounds, frames };
}
afterEach(() => vi.useRealTimers());
describe('native collapse animation', () => {
  it('starts the hide deadline after a delayed first paint opportunity', () => {
    vi.useFakeTimers();
    const shell = readFileSync(new URL('../src/shell.ts', import.meta.url), 'utf8');
    const body = shell.slice(shell.indexOf('function afterHidePaint('), shell.indexOf('// Timestamp of last collapse/expand.'))
      .replace('finish: () => void', 'finish');
    let paint;
    const finish = vi.fn();
    const context = vm.createContext({
      requestAnimationFrame: callback => { paint = callback; return 1; }, setTimeout,
      HIDE_FADE_MS: 240, collapsePaintFrame: null, collapseCompletion: null, finish,
    });
    vm.runInContext(body, context);
    vm.runInContext('afterHidePaint(finish)', context);
    vi.advanceTimersByTime(500);
    expect(finish).not.toHaveBeenCalled();
    paint(); vi.advanceTimersByTime(239);
    expect(finish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(finish).toHaveBeenCalledOnce();
  });
  it.each([47, 1])('does not snap to final height %s before animating', target => {
    vi.useFakeTimers();
    const h = harness();
    h.call(`collapseToHeader(${target}, ${target === 1})`);
    expect(h.bounds().height).toBe(500);
    vi.advanceTimersByTime(96);
    expect(h.bounds().height).toBeGreaterThan(target);
    expect(h.bounds().height).toBeLessThan(500);
    vi.advanceTimersByTime(200);
    expect(h.bounds().height).toBe(target);
    h.call('expandFromHeader(false)');
    expect(h.bounds().height).toBe(target);
    vi.advanceTimersByTime(300);
    expect(h.bounds()).toEqual({ x: 20, y: 30, width: 520, height: 500 });
  });
  it('cancels an interrupted collapse without pinning the expanded window', () => {
    vi.useFakeTimers();
    const h = harness();
    h.call('collapseToHeader(47)');
    vi.advanceTimersByTime(60);
    h.call('expandFromHeader(false)');
    vi.advanceTimersByTime(300);
    expect(h.bounds().height).toBe(500);
    expect(vi.getTimerCount()).toBe(0);
  });
});
