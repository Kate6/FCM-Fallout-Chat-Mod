// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observeAmbientMotion as observeStatusMotion } from '../src/ambient-motion';

let mutate;
let reduced;
let media;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  media = { matches: false, addEventListener: vi.fn((_, callback) => { reduced = callback; }), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('MutationObserver', class {
    constructor(callback) { mutate = callback; }
    observe() {} disconnect() {}
  });
});
afterEach(() => { document.body.replaceChildren(); document.documentElement.className = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const fixture = (names = ['fcm-typing-dot', 'fcm-channel-other', 'fcm-unread-pulse']) => {
  const root = document.createElement('div'); root.id = 'root'; document.body.append(root);
  const animations = names.map(animationName => {
    const target = document.createElement('span'); root.append(target);
    return { animationName, effect: { target }, playState: 'running', currentTime: 200,
      pause: vi.fn(), play: vi.fn() };
  });
  root.getAnimations = () => animations;
  return { root, animations };
};
it('freezes approved status animations without a recurring timer and leaves other motion alone', () => {
  const { root, animations } = fixture(); const control = observeStatusMotion(root);
  expect(animations[0].pause).toHaveBeenCalledOnce(); expect(animations[1].pause).not.toHaveBeenCalled();
  expect(animations[0].currentTime).toBe(0); expect(animations[2].currentTime).toBe(0);
  expect(animations[1].currentTime).toBe(200); expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(10_000); expect(animations[0].currentTime).toBe(0);
  mutate(); expect(vi.getTimerCount()).toBe(0);
  control.dispose(); expect(vi.getTimerCount()).toBe(0); expect(animations[0].play).not.toHaveBeenCalled();
});
it('stays timer-free across visibility, reduced-motion, empty, and disposal changes', () => {
  const { root, animations } = fixture(['fcm-typing-dot']); const control = observeStatusMotion(root);
  control.setVisible(false); expect(vi.getTimerCount()).toBe(0);
  control.setVisible(true); expect(vi.getTimerCount()).toBe(0);
  media.matches = true; control.setVisible(true); expect(vi.getTimerCount()).toBe(0); expect(animations[0].currentTime).toBe(0);
  media.matches = false; control.setVisible(true); expect(vi.getTimerCount()).toBe(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true); document.dispatchEvent(new Event('visibilitychange'));
  expect(vi.getTimerCount()).toBe(0);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false); document.dispatchEvent(new Event('visibilitychange'));
  expect(vi.getTimerCount()).toBe(0);
  root.getAnimations = () => []; mutate(); expect(vi.getTimerCount()).toBe(0);
  control.dispose(); mutate(); control.setVisible(true); expect(vi.getTimerCount()).toBe(0);
});
it('keeps typing and unread motion static across collapsed and full-hide states', () => {
  const { root, animations } = fixture(['fcm-typing-dot', 'fcm-unread-pulse']); const control = observeStatusMotion(root);
  root.classList.add('collapsed'); mutate(); vi.advanceTimersByTime(100);
  expect(animations[0].currentTime).toBe(0); expect(animations[1].currentTime).toBe(0);
  document.documentElement.classList.add('fcm-full-auto-hidden'); mutate(); expect(vi.getTimerCount()).toBe(0);
  document.documentElement.classList.remove('fcm-full-auto-hidden'); mutate(); expect(vi.getTimerCount()).toBe(0);
  control.dispose();
});
it('safely handles environments without the animation API', () => {
  const root = document.createElement('div'); const control = observeStatusMotion(root);
  control.setVisible(false); control.dispose(); expect(vi.getTimerCount()).toBe(0);
});
it('freezes name and pseudo-element effects regardless of viewport state', () => {
  const { root, animations } = fixture(['fcm-glow-pulse', 'fcm-glitch-r', 'fcm-glitch-c', 'fcm-shimmer-highlight', 'fcm-crt-flicker', 'fcm-chroma-preview']);
  const control = observeStatusMotion(root);
  vi.advanceTimersByTime(100); for (const animation of animations) expect(animation.currentTime).toBe(0);
  for (const animation of animations) animation.effect.target.setAttribute('data-fcm-motion-paused', '');
  mutate(); expect(vi.getTimerCount()).toBe(0);
  animations[0].effect.target.removeAttribute('data-fcm-motion-paused'); mutate(); expect(vi.getTimerCount()).toBe(0);
  animations[0].effect.target.classList.add('fcm-no-name-motion'); mutate(); expect(vi.getTimerCount()).toBe(0);
  control.dispose();
});
it('repeated mounting and page teardown leave no scheduler behind', () => {
  for (let i = 0; i < 100; i++) {
    const { root } = fixture(['fcm-typing-dot']); const control = observeStatusMotion(root);
    expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event('pagehide')); control.dispose(); root.remove();
    expect(vi.getTimerCount()).toBe(0);
  }
});
it('does not schedule animation ticks or query retained DOM geometry', () => {
  const { root, animations } = fixture(['fcm-glow-pulse']);
  const closest = vi.spyOn(animations[0].effect.target, 'closest');
  const control = observeStatusMotion(root); closest.mockClear();
  vi.advanceTimersByTime(1000); expect(closest).not.toHaveBeenCalled();
  control.dispose();
});
it('also budgets settings previews outside the collapsed chat root', () => {
  const { root, animations } = fixture(['fcm-chroma-preview']);
  document.body.append(animations[0].effect.target);
  document.body.getAnimations = () => animations;
  root.classList.add('collapsed');
  const control = observeStatusMotion(root, document.body);
  vi.advanceTimersByTime(100);
  expect(animations[0].pause).toHaveBeenCalledOnce();
  expect(animations[0].currentTime).toBe(0);
  control.dispose();
  delete document.body.getAnimations;
});
