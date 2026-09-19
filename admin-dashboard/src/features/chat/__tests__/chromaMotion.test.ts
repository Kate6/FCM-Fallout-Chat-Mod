import { afterEach, expect, it, vi } from 'vitest';
import { scheduleChromaMotion } from '../chromaMotion';

afterEach(() => vi.useRealTimers());
it('schedules only four shadow changes per cycle and tears down its timer', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const element = document.createElement('span');
  const writes = vi.spyOn(element, 'setAttribute');
  const stop = scheduleChromaMotion(element);
  expect(element.dataset.fcmChroma).toBe('rest');
  vi.advanceTimersByTime(9840);
  expect(element.dataset.fcmChroma).toBe('a');
  vi.advanceTimersByTime(240);
  expect(element.dataset.fcmChroma).toBe('b');
  vi.advanceTimersByTime(240);
  expect(element.dataset.fcmChroma).toBe('c');
  vi.advanceTimersByTime(480);
  expect(element.dataset.fcmChroma).toBe('rest');
  vi.advanceTimersByTime(1200);
  expect(writes).toHaveBeenCalledTimes(5);
  expect(vi.getTimerCount()).toBe(1);
  stop(); expect(vi.getTimerCount()).toBe(0);
  expect(element.hasAttribute('data-fcm-chroma')).toBe(false);
});
it('uses stable per-message phase and bounds malformed durations', () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  const element = document.createElement('span');
  element.style.setProperty('--fcm-chroma-duration', '12s');
  element.style.setProperty('--fcm-effect-delay', '-10s');
  const stop = scheduleChromaMotion(element);
  expect(element.dataset.fcmChroma).toBe('a'); stop();
  element.style.setProperty('--fcm-chroma-duration', '-1s');
  element.style.setProperty('--fcm-effect-delay', 'invalid');
  const cleanup = scheduleChromaMotion(element);
  vi.advanceTimersByTime(8610);
  expect(element.dataset.fcmChroma).toBe('a'); cleanup();
});
