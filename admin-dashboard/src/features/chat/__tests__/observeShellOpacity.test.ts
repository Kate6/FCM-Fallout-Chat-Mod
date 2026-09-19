import { afterEach, expect, it, vi } from 'vitest';
import { observeShellOpacity } from '../observeShellOpacity';

afterEach(() => { document.documentElement.removeAttribute('style'); vi.restoreAllMocks(); });
const tick = async () => { await Promise.resolve(); };
it('ignores unrelated root mutations without computed style reads or notifications', async () => {
  const read = vi.spyOn(window, 'getComputedStyle');
  const notify = vi.fn(); const stop = observeShellOpacity(document.documentElement, notify);
  expect(notify).toHaveBeenLastCalledWith(1, null);
  read.mockClear(); notify.mockClear();
  for (let i = 0; i < 100; i++) {
    document.documentElement.style.setProperty('--unrelated', String(i)); await tick();
  }
  expect(read).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled(); stop();
});
it('coalesces live opacity changes, clamps values, restores defaults and disconnects', async () => {
  const root = document.documentElement; const notify = vi.fn();
  const read = vi.spyOn(window, 'getComputedStyle');
  const stop = observeShellOpacity(root, notify); read.mockClear(); notify.mockClear();
  root.style.setProperty('--fcm-chrome-bg-alpha', '0.4');
  root.style.setProperty('--fcm-text-opacity', '0.6'); await tick();
  expect(notify).toHaveBeenLastCalledWith(.4, .6); expect(read).toHaveBeenCalledTimes(1);
  root.style.setProperty('--fcm-chrome-bg-alpha', '2');
  root.style.setProperty('--fcm-text-opacity', '-1'); await tick();
  expect(notify).toHaveBeenLastCalledWith(1, .1);
  root.removeAttribute('style'); await tick(); expect(notify).toHaveBeenLastCalledWith(1, null);
  notify.mockClear(); root.style.setProperty('--fcm-text-opacity', '.8'); stop(); await tick();
  expect(notify).not.toHaveBeenCalled();
});
