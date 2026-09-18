import { afterEach, expect, it, vi } from 'vitest';
import { observeScrollIntent } from '../observeScrollIntent';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const el = document.createElement('div');
  Object.defineProperties(el, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200, configurable: true } });
  el.scrollTop = 800;
  let pinned = true;
  const cancel = vi.fn();
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(fn => { frame = fn; return 1; });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => { frame = undefined; });
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resize = cb; } observe() {} disconnect = disconnect; });
  const stop = observeScrollIntent(el, { isPinned: () => pinned, setPinned: v => { pinned = v; }, cancelPendingPin: cancel });
  const flush = () => { const fn = frame; frame = undefined; fn?.(0); };
  return { el, stop, flush, resize: () => resize(), pinned: () => pinned, cancel, disconnect };
}
it('layout scroll and resize preserve bottom-follow instead of interpreting them as reading', () => {
  const h = setup(); h.el.scrollTop = 100;
  h.el.dispatchEvent(new Event('scroll')); h.resize(); h.flush();
  expect(h.pinned()).toBe(true); expect(h.cancel).not.toHaveBeenCalled();
  expect(h.el.scrollTop).toBe(1000); h.stop();
});
it('upward wheel cancels pending pins before the scroll event and preserves reading', () => {
  const h = setup();
  h.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
  expect(h.pinned()).toBe(false); expect(h.cancel).toHaveBeenCalledOnce();
  h.el.scrollTop = 400; h.el.dispatchEvent(new Event('scroll')); h.resize(); h.flush();
  expect(h.el.scrollTop).toBe(400);
  h.el.scrollTop = 800; h.el.dispatchEvent(new Event('scroll'));
  expect(h.pinned()).toBe(true); h.stop();
});
it('keyboard scrolling cancels pins but typing in an editor does not', () => {
  const h = setup(); const editor = document.createElement('textarea'); h.el.append(editor);
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  expect(h.cancel).not.toHaveBeenCalled();
  h.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp' }));
  expect(h.pinned()).toBe(false); h.stop();
});
it('teardown removes listeners, disconnects observation and rejects queued callbacks', () => {
  const h = setup(); h.resize(); h.stop(); h.resize(); h.flush();
  h.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -10 }));
  expect(h.cancel).not.toHaveBeenCalled(); expect(h.disconnect).toHaveBeenCalledOnce();
  expect(h.el.scrollTop).toBe(800);
});
it('late image loading and history growth keep a following feed at the bottom', () => {
  const h = setup();
  Object.defineProperty(h.el, 'scrollHeight', { value: 2000, configurable: true });
  h.el.dispatchEvent(new Event('load')); h.flush();
  expect(h.el.scrollTop).toBe(2000); expect(h.pinned()).toBe(true); h.stop();
});
it('an expired gesture does not let later layout events change reading intent', () => {
  const h = setup(); let now = 1000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  h.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
  h.el.scrollTop = 300; h.el.dispatchEvent(new Event('scroll'));
  now = 2000;
  h.el.dispatchEvent(new Event('scroll')); h.resize(); h.flush();
  expect(h.pinned()).toBe(false); expect(h.el.scrollTop).toBe(300); h.stop();
});
it('a size change during a recent wheel gesture is still layout, not renewed bottom-follow', () => {
  const h = setup(); h.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));
  h.el.scrollTop = 400; h.el.dispatchEvent(new Event('scroll'));
  Object.defineProperty(h.el, 'clientHeight', { value: 600, configurable: true });
  h.el.dispatchEvent(new Event('scroll')); h.resize(); h.flush();
  expect(h.pinned()).toBe(false); expect(h.el.scrollTop).toBe(400); h.stop();
});
it('scrollbar and touch gestures establish reading intent, ordinary content clicks do not', () => {
  const h = setup();
  Object.defineProperty(h.el, 'offsetWidth', { value: 220 });
  Object.defineProperty(h.el, 'clientWidth', { value: 200 });
  vi.spyOn(h.el, 'getBoundingClientRect').mockReturnValue({ right: 220, width: 220 } as DOMRect);
  const pointer = (x: number, type: string) => {
    const event = new Event('pointerdown');
    Object.defineProperties(event, { clientX: { value: x }, pointerType: { value: type } });
    h.el.dispatchEvent(event);
  };
  pointer(50, 'mouse'); expect(h.cancel).not.toHaveBeenCalled();
  pointer(210, 'mouse'); expect(h.pinned()).toBe(false);
  window.dispatchEvent(new Event('pointerup'));
  pointer(50, 'touch'); expect(h.cancel).toHaveBeenCalledTimes(2); h.stop();
});
