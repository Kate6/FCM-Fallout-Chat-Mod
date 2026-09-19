/** Four discrete shadow changes per cycle, without a continuously ticking animation. */
export function scheduleChromaMotion(element: HTMLElement): () => void {
  const seconds = Number.parseFloat(element.style.getPropertyValue('--fcm-chroma-duration'));
  const duration = Number.isFinite(seconds) ? Math.min(15.5, Math.max(10.5, seconds)) * 1000 : 12000;
  const delay = Number.parseFloat(element.style.getPropertyValue('--fcm-effect-delay'));
  const phase = Number.isFinite(delay) ? -delay * 1000 : 0;
  const started = performance.now();
  const boundaries = [0.82, 0.84, 0.86, 0.9, 1.82];
  let timer: ReturnType<typeof setTimeout>;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const position = (((performance.now() - started + phase) % duration) + duration) % duration / duration;
    const state = position < 0.82 || position >= 0.9 ? 'rest' : position < 0.84 ? 'a' : position < 0.86 ? 'b' : 'c';
    if (element.getAttribute('data-fcm-chroma') !== state) element.setAttribute('data-fcm-chroma', state);
    const next = boundaries.find(boundary => boundary > position) ?? 1.82;
    timer = setTimeout(tick, Math.max(1, Math.ceil((next - position) * duration - 0.000001)));
  };
  tick();
  return () => { stopped = true; clearTimeout(timer); element.removeAttribute('data-fcm-chroma'); };
}
