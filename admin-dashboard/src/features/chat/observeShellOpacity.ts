/** Shell-owned inline values: unrelated root styles must not force style resolution. */
export function observeShellOpacity(root: HTMLElement, notify: (alpha: number, text: number | null) => void): () => void {
  let previousAlpha: string | undefined;
  let previousText: string | undefined;
  let disposed = false;
  const read = () => {
    if (disposed) return;
    const alpha = root.style.getPropertyValue('--fcm-chrome-bg-alpha');
    const text = root.style.getPropertyValue('--fcm-text-opacity');
    if (alpha === previousAlpha && text === previousText) return;
    previousAlpha = alpha; previousText = text;
    // One computed read retains CSS variable/fallback semantics for real changes.
    const style = root.ownerDocument.defaultView?.getComputedStyle(root);
    const a = parseFloat(style?.getPropertyValue('--fcm-chrome-bg-alpha') ?? '');
    const t = parseFloat(style?.getPropertyValue('--fcm-text-opacity') ?? '');
    notify(Number.isNaN(a) ? 1 : Math.max(0, Math.min(1, a)),
      Number.isNaN(t) ? null : Math.max(.1, Math.min(1, t)));
  };
  const observer = new MutationObserver(read);
  observer.observe(root, { attributes: true, attributeFilter: ['style'] });
  read();
  return () => { disposed = true; observer.disconnect(); };
}
