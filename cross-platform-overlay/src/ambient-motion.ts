/** Desktop-only budget for repeating decorative motion. The original CSS
 * keyframes/delays/colors stay authoritative; only their sampling rate changes.
 * No RAF loop, React updates, layout reads, or changes to interaction transitions.
 */
export function observeAmbientMotion(root: HTMLElement, scope: HTMLElement = root) {
  const doc = root.ownerDocument;
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  type MotionEntry = { target: Element; name: string; time: number; stamp: number };
  const entries = new Map<Animation, MotionEntry>();
  let activeEntries: [Animation, MotionEntry][] = [];
  let disposed = false;
  let visible = true;
  let timer: ReturnType<typeof setInterval> | undefined;
  const names = new Set(['fcm-typing-dot', 'fcm-unread-pulse', 'fcm-glow-pulse',
    'fcm-crt-flicker', 'fcm-glitch-r', 'fcm-glitch-c', 'fcm-shimmer-highlight', 'fcm-chroma-preview']);
  const active = (entry: { name: string; target: Element }) => visible && !doc.hidden && !reduced?.matches
    && !doc.documentElement.classList.contains('fcm-full-auto-hidden')
    && !doc.documentElement.classList.contains('fcm-full-auto-fading')
    && !(entry.name !== 'fcm-unread-pulse' && root.classList.contains('collapsed') && root.contains(entry.target))
    && !entry.target.closest('[data-fcm-motion-paused],.fcm-no-name-motion');
  const reconcileTimer = () => {
    // Visibility/class mutations rebuild this list. Never scan retained offscreen
    // history or read DOM geometry on a sampling tick.
    activeEntries = [...entries].filter(([, entry]) => active(entry));
    const needed = activeEntries.length > 0;
    if (!needed && timer !== undefined) { clearInterval(timer); timer = undefined; }
    if (needed && timer === undefined) timer = setInterval(() => {
      const now = performance.now();
      for (const [animation, entry] of activeEntries) animation.currentTime = entry.time + now - entry.stamp;
    }, 100);
  };
  const sync = () => {
    if (disposed || !scope.getAnimations) return;
    const animations = scope.getAnimations({ subtree: true }).filter(animation =>
      'animationName' in animation && typeof animation.animationName === 'string' && names.has(animation.animationName));
    const next = new Set(animations);
    for (const [animation, entry] of entries) {
      if (!next.has(animation)) { entry.target.removeAttribute('data-fcm-status-motion'); entries.delete(animation); }
    }
    for (const animation of animations) {
      if (entries.has(animation)) {
        // CSS play-state changes when an offscreen name returns may resume it.
        if (animation.playState === 'running') animation.pause();
        continue;
      }
      const target = animation.effect && 'target' in animation.effect ? animation.effect.target : null;
      if (!(target instanceof Element) || !('animationName' in animation) || typeof animation.animationName !== 'string') continue;
      animation.pause();
      const time = typeof animation.currentTime === 'number' ? animation.currentTime : 0;
      entries.set(animation, { target, name: animation.animationName, time, stamp: performance.now() });
      target.setAttribute('data-fcm-status-motion', animation.animationName);
    }
    if (reduced?.matches) for (const [animation, entry] of entries) {
      animation.currentTime = 0; entry.time = 0; entry.stamp = performance.now();
    }
    reconcileTimer();
  };
  const mutations = new MutationObserver(sync);
  mutations.observe(scope, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-fcm-motion-paused'] });
  mutations.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  doc.addEventListener('visibilitychange', sync);
  reduced?.addEventListener('change', sync);
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) clearInterval(timer);
    mutations.disconnect(); doc.removeEventListener('visibilitychange', sync);
    reduced?.removeEventListener('change', sync);
    doc.defaultView?.removeEventListener('pagehide', dispose);
    for (const [animation, entry] of entries) {
      entry.target.removeAttribute('data-fcm-status-motion');
      if (entry.target.isConnected) animation.play();
    }
    entries.clear();
    activeEntries = [];
  };
  doc.defaultView?.addEventListener('pagehide', dispose);
  sync();
  return { dispose, setVisible(value: boolean) { if (disposed || visible === value) return; visible = value; sync(); } };
}
