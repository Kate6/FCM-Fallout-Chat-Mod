type ScrollIntent = {
  isPinned: () => boolean;
  setPinned: (pinned: boolean) => void;
  cancelPendingPin: () => void;
};

/** Layout-generated scroll events are not evidence of a reader scrolling up.
 * Only input on the list grants a short scrolling gesture; layout/asset changes
 * otherwise preserve the previous intent. Event-driven, at most one queued RAF.
 */
export function observeScrollIntent(element: HTMLElement, intent: ScrollIntent): () => void {
  let disposed = false;
  let frame: number | null = null;
  let gestureUntil = 0;
  let dragging = false;
  let previousHeight = element.clientHeight;
  let previousContentHeight = element.scrollHeight;
  const nearBottom = () => element.scrollHeight - element.scrollTop - element.clientHeight <= 80;
  const beginGesture = (reading: boolean) => {
    previousHeight = element.clientHeight;
    previousContentHeight = element.scrollHeight;
    gestureUntil = Date.now() + 800;
    intent.cancelPendingPin();
    if (reading) intent.setPinned(false);
  };
  const schedule = () => {
    if (disposed || frame !== null || !intent.isPinned()) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (disposed || !intent.isPinned() || element.clientHeight === 0) return;
      if (element.scrollHeight - element.scrollTop - element.clientHeight > 1) {
        element.scrollTop = element.scrollHeight;
      }
    });
  };
  const onScroll = () => {
    const layoutChanged = previousHeight !== element.clientHeight || previousContentHeight !== element.scrollHeight;
    previousHeight = element.clientHeight;
    previousContentHeight = element.scrollHeight;
    if (!layoutChanged && (dragging || Date.now() < gestureUntil)) {
      intent.setPinned(nearBottom());
    } else schedule();
  };
  const onWheel = (event: WheelEvent) => {
    if (event.deltaY !== 0) beginGesture(event.deltaY < 0);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof Element && event.target.closest('input,textarea,[contenteditable="true"]')) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
      beginGesture(['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey));
    }
  };
  const onPointer = (event: PointerEvent) => {
    // A click on a message/link is not scroll intent. Native scrollbar drags and
    // touch panning are; use visual coordinates so CSS zoom remains correct.
    const rect = element.getBoundingClientRect();
    const gutter = Math.max(0, element.offsetWidth - element.clientWidth) * (element.offsetWidth ? rect.width / element.offsetWidth : 1);
    if (event.pointerType === 'touch' || event.clientX >= rect.right - gutter) {
      dragging = true;
      beginGesture(true);
    }
  };
  const endPointer = () => { if (dragging) gestureUntil = Date.now() + 800; dragging = false; };
  const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  resize?.observe(element);
  const mutation = new MutationObserver(schedule);
  mutation.observe(element, { childList: true, subtree: true, characterData: true });
  element.addEventListener('scroll', onScroll, { passive: true });
  element.addEventListener('wheel', onWheel, { passive: true });
  element.addEventListener('keydown', onKey);
  element.addEventListener('pointerdown', onPointer, { passive: true });
  element.addEventListener('load', schedule, true);
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  window.addEventListener('resize', schedule);
  return () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    resize?.disconnect(); mutation.disconnect();
    element.removeEventListener('scroll', onScroll);
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('keydown', onKey);
    element.removeEventListener('pointerdown', onPointer);
    element.removeEventListener('load', schedule, true);
    window.removeEventListener('pointerup', endPointer);
    window.removeEventListener('pointercancel', endPointer);
    window.removeEventListener('resize', schedule);
  };
}
