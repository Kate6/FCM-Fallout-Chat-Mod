import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeNameMotion } from '../observeNameMotion';
let intersect: (entries: { target: Element; isIntersecting: boolean }[]) => void;
let mutate: () => void;
const disconnect = vi.fn(); const unobserve = vi.fn(); const observe = vi.fn();
beforeEach(() => {
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe = observe; unobserve = unobserve; disconnect = disconnect;
  });
  vi.stubGlobal('MutationObserver', class {
    constructor(callback: () => void) { mutate = callback; }
    observe = vi.fn(); disconnect = disconnect;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const fixture = () => {
  const container = document.createElement('div');
  const name = document.createElement('span'); name.className = 'fcm-name-fx--shimmer';
  container.append(name); return { container, name };
};
const paused = (element: Element) => element.hasAttribute('data-fcm-motion-paused');
it('schedules chroma only while visible and releases timers on opt-out/removal', () => {
  vi.useFakeTimers();
  const { container, name } = fixture(); name.className = 'fcm-name-fx--chroma-split';
  const stop = observeNameMotion(container, true);
  expect(vi.getTimerCount()).toBe(0);
  intersect([{ target: name, isIntersecting: true }]); expect(vi.getTimerCount()).toBe(1);
  mutate(); expect(vi.getTimerCount()).toBe(1);
  name.classList.add('fcm-no-name-motion'); mutate(); expect(vi.getTimerCount()).toBe(0);
  name.classList.remove('fcm-no-name-motion'); mutate(); expect(vi.getTimerCount()).toBe(1);
  intersect([{ target: name, isIntersecting: false }]); expect(vi.getTimerCount()).toBe(0);
  intersect([{ target: name, isIntersecting: true }]);
  name.remove(); mutate(); expect(vi.getTimerCount()).toBe(0); stop();
});
it('pauses offscreen names, resumes entering names, and preserves DOM content', () => {
  const { container, name } = fixture(); name.textContent = 'Fixture name';
  const stop = observeNameMotion(container, true); expect(paused(name)).toBe(true);
  intersect([{ target: name, isIntersecting: true }]); expect(paused(name)).toBe(false);
  intersect([{ target: name, isIntersecting: false }]); expect(paused(name)).toBe(true);
  expect(name.textContent).toBe('Fixture name'); stop(); expect(paused(name)).toBe(false);
});
it('keeps all names paused when the native overlay is hidden', () => {
  const { container, name } = fixture(); const stop = observeNameMotion(container, false);
  intersect([{ target: name, isIntersecting: true }]); expect(paused(name)).toBe(true); stop();
});
it('cancels chroma timers when the document is hidden and on teardown', () => {
  vi.useFakeTimers();
  const { container, name } = fixture(); name.className = 'fcm-name-fx--chroma-split';
  const stop = observeNameMotion(container, true);
  intersect([{ target: name, isIntersecting: true }]); expect(vi.getTimerCount()).toBe(1);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  document.dispatchEvent(new Event('visibilitychange'));
  expect(vi.getTimerCount()).toBe(0); expect(name.hasAttribute('data-fcm-chroma')).toBe(false);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange')); expect(vi.getTimerCount()).toBe(1);
  stop(); expect(vi.getTimerCount()).toBe(0);
});
it('suspends chroma during shell collapse/full-hide even if geometry still intersects', () => {
  vi.useFakeTimers();
  const { container, name } = fixture(); name.className = 'fcm-name-fx--chroma-split';
  const root = document.createElement('div'); root.id = 'root'; root.append(container);
  const stop = observeNameMotion(container, true);
  try {
    intersect([{ target: name, isIntersecting: true }]); expect(vi.getTimerCount()).toBe(1);
    root.classList.add('collapsed'); mutate();
    expect(paused(name)).toBe(true); expect(vi.getTimerCount()).toBe(0);
    expect(name.hasAttribute('data-fcm-chroma')).toBe(false);
    root.classList.remove('collapsed'); mutate(); expect(vi.getTimerCount()).toBe(1);
    for (const state of ['fcm-full-auto-fading', 'fcm-full-auto-hidden']) {
      document.documentElement.classList.add(state); mutate();
      expect(paused(name)).toBe(true); expect(vi.getTimerCount()).toBe(0);
      document.documentElement.classList.remove(state); mutate(); expect(vi.getTimerCount()).toBe(1);
    }
  } finally { document.documentElement.className = ''; stop(); }
});
it('honors document visibility and returns visible names to their previous state', () => {
  const { container, name } = fixture(); const stop = observeNameMotion(container, true);
  intersect([{ target: name, isIntersecting: true }]);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  expect(paused(name)).toBe(true);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
  expect(paused(name)).toBe(false); stop();
});
it('discovers new effects and releases removed or changed effects', () => {
  const { container, name } = fixture(); const stop = observeNameMotion(container, true);
  const added = document.createElement('span'); added.className = 'fcm-name-fx--glitch'; container.append(added); mutate();
  expect(observe).toHaveBeenCalledWith(added); name.className = ''; mutate();
  expect(unobserve).toHaveBeenCalledWith(name); expect(paused(name)).toBe(false);
  added.remove(); mutate(); expect(unobserve).toHaveBeenCalledWith(added); stop();
});
it('100 teardown cycles disconnect observers and ignore queued deliveries', () => {
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  for (let i = 0; i < 100; i++) {
    const { container, name } = fixture(); const stop = observeNameMotion(container, true); stop();
    mutate(); intersect([{ target: name, isIntersecting: false }]);
    expect(paused(name)).toBe(false);
  }
  expect(disconnect).toHaveBeenCalledTimes(200); expect(observe).toHaveBeenCalledTimes(100);
  expect(remove.mock.calls).toEqual(add.mock.calls);
});
