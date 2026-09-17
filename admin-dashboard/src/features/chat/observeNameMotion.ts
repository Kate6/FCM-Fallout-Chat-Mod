const SELECTOR = ['glow-pulse', 'crt-phosphor', 'glitch', 'shimmer', 'chroma-split']
  .map(effect => `.fcm-name-fx--${effect}`).join(',');
const PAUSED = 'data-fcm-motion-paused';

/** Keep cosmetic motion live only near the visible chat viewport. No message/state mutation. */
export function observeNameMotion(container: HTMLElement, visible: boolean): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const doc = container.ownerDocument;
  let disposed = false;
  const targets = new Map<Element, boolean>();
  const apply = (element: Element, intersects: boolean) => {
    element.toggleAttribute(PAUSED, !visible || doc.hidden || !intersects);
  };
  const intersections = new IntersectionObserver(entries => {
    if (disposed) return;
    for (const entry of entries) {
      if (!targets.has(entry.target)) continue;
      targets.set(entry.target, entry.isIntersecting);
      apply(entry.target, entry.isIntersecting);
    }
  }, { root: container, rootMargin: '32px', threshold: 0 });
  const sync = () => {
    if (disposed) return;
    for (const element of targets.keys()) {
      if (!container.contains(element) || !element.matches(SELECTOR)) {
        intersections.unobserve(element); targets.delete(element); element.removeAttribute(PAUSED);
      }
    }
    for (const element of container.querySelectorAll(SELECTOR)) {
      if (targets.has(element)) continue;
      targets.set(element, false); apply(element, false); intersections.observe(element);
    }
  };
  const mutations = new MutationObserver(sync);
  mutations.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  const visibility = () => { for (const [element, intersects] of targets) apply(element, intersects); };
  doc.addEventListener('visibilitychange', visibility);
  sync();
  return () => {
    disposed = true;
    intersections.disconnect(); mutations.disconnect();
    doc.removeEventListener('visibilitychange', visibility);
    for (const element of targets.keys()) element.removeAttribute(PAUSED);
    targets.clear();
  };
}
