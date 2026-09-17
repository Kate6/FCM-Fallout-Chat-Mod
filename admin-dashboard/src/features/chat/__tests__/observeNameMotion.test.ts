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
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const fixture = () => {
  const container = document.createElement('div');
  const name = document.createElement('span'); name.className = 'fcm-name-fx--shimmer';
  container.append(name); return { container, name };
};
const paused = (element: Element) => element.hasAttribute('data-fcm-motion-paused');
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
