/** Desktop-only frame-time guard for repeating decorative motion.
 *
 * A transparent always-on-top Chromium surface shares composition time with the
 * game. Even a bounded 10 Hz sampler creates recurring main-thread and paint work,
 * so the desktop overlay holds decorative CSS animations on their first frame.
 * Static colours, shadows and outlines remain; interaction transitions are not
 * selected here and continue to run normally.
 */
export function observeAmbientMotion(root: HTMLElement, scope: HTMLElement = root) {
  const doc = root.ownerDocument;
  const entries = new Map<Animation, Element>();
  let disposed = false;
  const names = new Set(['fcm-typing-dot', 'fcm-unread-pulse', 'fcm-glow-pulse',
    'fcm-crt-flicker', 'fcm-glitch-r', 'fcm-glitch-c', 'fcm-shimmer-highlight', 'fcm-chroma-preview']);
  const sync = () => {
    if (disposed || !scope.getAnimations) return;
    const animations = scope.getAnimations({ subtree: true }).filter(animation =>
      'animationName' in animation && typeof animation.animationName === 'string' && names.has(animation.animationName));
    const next = new Set(animations);
    for (const [animation, target] of entries) {
      if (!next.has(animation)) { target.removeAttribute('data-fcm-status-motion'); entries.delete(animation); }
    }
    for (const animation of animations) {
      if (entries.has(animation)) {
        if (animation.playState === 'running') animation.pause();
        animation.currentTime = 0;
        continue;
      }
      const target = animation.effect && 'target' in animation.effect ? animation.effect.target : null;
      if (!(target instanceof Element) || !('animationName' in animation) || typeof animation.animationName !== 'string') continue;
      animation.pause();
      animation.currentTime = 0;
      entries.set(animation, target);
      target.setAttribute('data-fcm-status-motion', animation.animationName);
    }
  };
  const mutations = new MutationObserver(sync);
  mutations.observe(scope, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'data-fcm-motion-paused'] });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    mutations.disconnect();
    doc.defaultView?.removeEventListener('pagehide', dispose);
    for (const target of entries.values()) target.removeAttribute('data-fcm-status-motion');
    entries.clear();
  };
  doc.defaultView?.addEventListener('pagehide', dispose);
  sync();
  return { dispose, setVisible(_value: boolean) { sync(); } };
}
