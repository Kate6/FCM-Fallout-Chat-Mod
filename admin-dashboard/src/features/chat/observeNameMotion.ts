import { scheduleChromaMotion } from './chromaMotion';

const SELECTOR = ['glow-pulse', 'crt-phosphor', 'glitch', 'shimmer', 'chroma-split']
  .map(effect => `.fcm-name-fx--${effect}`).join(',');
const PAUSED = 'data-fcm-motion-paused';

/** Keep cosmetic motion live only near the visible chat viewport. No message/state mutation. */
export function observeNameMotion(container: HTMLElement, visible: boolean): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const doc = container.ownerDocument;
  const shellRoot = container.closest('#root');
  let disposed = false;
  const targets = new Map<Element, boolean>();
  const chroma = new Map<Element, () => void>();
  const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)');
  const stopChroma = (element: Element) => { chroma.get(element)?.(); chroma.delete(element); };
  const apply = (element: Element, intersects: boolean) => {
    // A one-pixel full-hide window can remain document-visible, and an opacity
    // fade does not make IntersectionObserver report an empty intersection.
    const shown = visible && !doc.hidden && !shellRoot?.classList.contains('collapsed')
      && !doc.documentElement.classList.contains('fcm-full-auto-hidden')
      && !doc.documentElement.classList.contains('fcm-full-auto-fading');
    element.toggleAttribute(PAUSED, !shown || !intersects);
    const active = shown && intersects && !reduced?.matches
      && element.matches('.fcm-name-fx--chroma-split:not(.fcm-no-name-motion)');
    if (!active) stopChroma(element);
    else if (!chroma.has(element) && element instanceof HTMLElement) chroma.set(element, scheduleChromaMotion(element));
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
        stopChroma(element);
      }
    }
    for (const element of container.querySelectorAll(SELECTOR)) {
      if (targets.has(element)) { apply(element, targets.get(element) ?? false); continue; }
      targets.set(element, false); apply(element, false); intersections.observe(element);
    }
  };
  const mutations = new MutationObserver(sync);
  mutations.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  if (shellRoot && shellRoot !== container) mutations.observe(shellRoot, { attributes: true, attributeFilter: ['class'] });
  mutations.observe(doc.documentElement, { attributes: true, attributeFilter: ['class'] });
  const visibility = () => { for (const [element, intersects] of targets) apply(element, intersects); };
  doc.addEventListener('visibilitychange', visibility);
  reduced?.addEventListener('change', visibility);
  sync();
  return () => {
    disposed = true;
    intersections.disconnect(); mutations.disconnect();
    doc.removeEventListener('visibilitychange', visibility);
    reduced?.removeEventListener('change', visibility);
    for (const stop of chroma.values()) stop();
    chroma.clear();
    for (const element of targets.keys()) element.removeAttribute(PAUSED);
    targets.clear();
  };
}
