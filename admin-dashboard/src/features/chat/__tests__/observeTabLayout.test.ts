import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeTabLayout } from '../observeTabLayout';

let frames: Map<number, FrameRequestCallback>;
let resize: () => void;
let mutate: () => void;
const disconnectSize = vi.fn();
const disconnectMutation = vi.fn();
const unobserve = vi.fn();
const flush = () => {
  const pending = [...frames.values()]; frames.clear();
  for (const callback of pending) callback(0);
};
beforeEach(() => {
  frames = new Map(); let sequence = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frames.set(++sequence, callback); return sequence; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe = vi.fn(); unobserve = unobserve; disconnect = disconnectSize;
  });
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { mutate = callback; }
    observe = vi.fn(); disconnect = disconnectMutation;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('measures once then stays idle; coalesces resize and mutation callbacks', () => {
  const row = document.createElement('div'); const measure = vi.fn();
  const stop = observeTabLayout(row, measure);
  flush(); expect(measure).toHaveBeenCalledTimes(1); expect(frames.size).toBe(0);
  resize(); mutate(); window.dispatchEvent(new Event('resize'));
  expect(frames.size).toBe(1); flush(); expect(measure).toHaveBeenCalledTimes(2);
  flush(); expect(measure).toHaveBeenCalledTimes(2); stop();
});
it('drops removed sibling observations', () => {
  const row = document.createElement('div'); const tab = document.createElement('div'); row.append(tab);
  const stop = observeTabLayout(row, vi.fn()); tab.remove(); mutate();
  expect(unobserve).toHaveBeenCalledWith(tab); stop();
});
it('keeps fallback measurement working without ResizeObserver', () => {
  vi.stubGlobal('ResizeObserver', undefined);
  const measure = vi.fn(); const stop = observeTabLayout(document.createElement('div'), measure);
  flush(); window.dispatchEvent(new Event('resize')); flush();
  expect(measure).toHaveBeenCalledTimes(2); stop();
});
it('cancels hidden work and remeasures when visible', () => {
  const measure = vi.fn(); const stop = observeTabLayout(document.createElement('div'), measure);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange')); resize();
  expect(frames.size).toBe(0); flush(); expect(measure).not.toHaveBeenCalled();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange')); flush(); expect(measure).toHaveBeenCalledTimes(1); stop();
});
it('100 mount/unmount cycles disconnect everything and reject delayed callbacks', () => {
  const addWindow = vi.spyOn(window, 'addEventListener');
  const removeWindow = vi.spyOn(window, 'removeEventListener');
  const addDocument = vi.spyOn(document, 'addEventListener');
  const removeDocument = vi.spyOn(document, 'removeEventListener');
  const measure = vi.fn();
  for (let cycle = 0; cycle < 100; cycle++) {
    const stop = observeTabLayout(document.createElement('div'), measure);
    stop(); resize(); mutate(); window.dispatchEvent(new Event('resize'));
    document.dispatchEvent(new Event('visibilitychange')); flush();
    expect(frames.size).toBe(0);
  }
  expect(measure).not.toHaveBeenCalled();
  expect(disconnectSize).toHaveBeenCalledTimes(100);
  expect(disconnectMutation).toHaveBeenCalledTimes(100);
  expect(removeWindow.mock.calls).toEqual(addWindow.mock.calls);
  expect(removeDocument.mock.calls).toEqual(addDocument.mock.calls);
});
it('font completion schedules work, but a ready promise cannot resurrect a disposed observer', async () => {
  const original = Object.getOwnPropertyDescriptor(document, 'fonts');
  const fonts = new EventTarget();
  let ready: () => void = () => {};
  Object.defineProperty(fonts, 'ready', { value: new Promise<void>(resolve => { ready = resolve; }) });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  try {
    const measure = vi.fn(); const stop = observeTabLayout(document.createElement('div'), measure);
    flush(); fonts.dispatchEvent(new Event('loadingdone')); flush();
    expect(measure).toHaveBeenCalledTimes(2);
    stop(); ready(); await Promise.resolve(); fonts.dispatchEvent(new Event('loadingdone'));
    expect(frames.size).toBe(0);
  } finally {
    if (original) Object.defineProperty(document, 'fonts', original);
    else Reflect.deleteProperty(document, 'fonts');
  }
});
