/** Coalesce actual geometry changes, never poll layout on every animation frame. */
export function observeTabLayout(row: HTMLElement, measure: () => void): () => void {
  const doc = row.ownerDocument;
  const win = doc.defaultView;
  if (!win) return () => {};
  let disposed = false;
  let frame: number | undefined;
  const schedule = () => {
    if (disposed || frame !== undefined || doc.hidden) return;
    frame = win.requestAnimationFrame(() => {
      frame = undefined;
      if (!disposed && !doc.hidden) measure();
    });
  };
  // Sibling width changes can move the active tab without resizing the row.
  // Older web/test environments still get mutation, font and window-resize
  // updates; missing ResizeObserver must never prevent chat from mounting.
  const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  const observed = new Set<Element>();
  const syncChildren = () => {
    const next = new Set<Element>([row, ...row.children]);
    for (const element of observed) {
      if (!next.has(element)) { sizes?.unobserve(element); observed.delete(element); }
    }
    for (const element of next) {
      if (!observed.has(element)) { sizes?.observe(element); observed.add(element); }
    }
  };
  syncChildren();
  const mutations = new MutationObserver(() => {
    if (disposed) return;
    syncChildren(); schedule();
  });
  mutations.observe(row, { childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['class', 'style'] });
  // Includes shell zoom/font settings, without observing chat-message mutations.
  for (let parent = row.parentElement; parent; parent = parent.parentElement) {
    mutations.observe(parent, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  const visibility = () => {
    if (doc.hidden && frame !== undefined) { win.cancelAnimationFrame(frame); frame = undefined; }
    else schedule();
  };
  win.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('resize', schedule);
  doc.addEventListener('visibilitychange', visibility);
  doc.fonts?.addEventListener('loadingdone', schedule);
  void doc.fonts?.ready.then(schedule);
  schedule();
  return () => {
    disposed = true;
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    sizes?.disconnect();
    observed.clear();
    mutations.disconnect();
    win.removeEventListener('resize', schedule);
    win.visualViewport?.removeEventListener('resize', schedule);
    doc.removeEventListener('visibilitychange', visibility);
    doc.fonts?.removeEventListener('loadingdone', schedule);
  };
}
