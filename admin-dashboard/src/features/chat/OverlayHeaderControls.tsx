import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface OnlineStats { totalOnline: number; observedPlayers: number | null; bindingId: string | null }
export function readOnlineStats(value: unknown): OnlineStats | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (!Number.isSafeInteger(p.totalOnline) || Number(p.totalOnline) < 0
    || (p.observedPlayers !== null && (!Number.isSafeInteger(p.observedPlayers) || Number(p.observedPlayers) < 1 || Number(p.observedPlayers) > 24))
    || (p.bindingId !== null && typeof p.bindingId !== 'string')) return null;
  return { totalOnline: Number(p.totalOnline), observedPlayers: p.observedPlayers === null ? null : Number(p.observedPlayers), bindingId: p.bindingId as string | null };
}

/** Overlay-only controls. Portals avoid the main tab row's overflow clipping. */
export function OverlayHeaderControls({ connected, socket, scope, bindingId, alwaysOnline, alwaysServer,
  color, background, onRefresh, onSettings, onMinimize }: {
  connected: boolean; socket: WebSocket | null; scope: string; bindingId: string | null;
  alwaysOnline: boolean; alwaysServer: boolean; color: string; background: string;
  onRefresh?: () => void; onSettings: () => void; onMinimize?: () => void;
}) {
  const [popup, setPopup] = useState<'stats' | 'actions' | null>(null);
  const [stats, setStats] = useState<OnlineStats | null>(null);
  const [anchor, setAnchor] = useState({ top: 0, right: 0 });
  const live = useRef<HTMLButtonElement>(null);
  const arrow = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const interested = popup === 'stats' || alwaysOnline || alwaysServer;
  useEffect(() => { setPopup(null); setStats(null); }, [scope, bindingId, connected]);
  useEffect(() => {
    if (!connected || !socket || !interested) return;
    setStats(null);
    let pending = ''; let requestedAt = 0; let lastReply = 0;
    const request = () => {
      if (document.visibilityState === 'hidden' || socket.readyState !== WebSocket.OPEN) return;
      if (pending && Date.now() - requestedAt < 10_000) return;
      if (lastReply && Date.now() - lastReply > 45_000) setStats(null);
      pending = crypto.randomUUID(); requestedAt = Date.now();
      socket.send(JSON.stringify({ type: 'presence:stats', payload: { requestId: pending } }));
    };
    const receive = (event: MessageEvent) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.type !== 'presence:stats' || frame.payload?.requestId !== pending) return;
        const parsed = readOnlineStats(frame.payload);
        if (!parsed || parsed.bindingId !== bindingId) return;
        pending = ''; lastReply = Date.now(); setStats(parsed);
      } catch { /* Ignore unrelated or malformed frames. */ }
    };
    socket.addEventListener('message', receive);
    request(); const timer = window.setInterval(request, 30_000);
    return () => { clearInterval(timer); socket.removeEventListener('message', receive); };
  }, [socket, scope, bindingId, connected, interested]);
  useEffect(() => {
    if (!popup) return;
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)
        && !live.current?.contains(event.target) && !arrow.current?.contains(event.target)) setPopup(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setPopup(null); if (popup === 'actions') arrow.current?.focus(); }
    };
    const resize = () => setPopup(null);
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', resize);
    if (popup === 'actions') panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape, true); window.removeEventListener('resize', resize); };
  }, [popup]);
  const open = (kind: 'stats' | 'actions') => {
    const rect = (kind === 'stats' ? live : arrow).current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 4, right: Math.max(4, window.innerWidth - rect.right) });
    setPopup(kind);
  };
  const onlineText = connected && stats ? `${stats.totalOnline} FCM online` : 'FCM online: unavailable';
  const serverText = connected && stats?.observedPlayers != null ? `${stats.observedPlayers} observed on server` : 'Server players: unavailable';
  const buttonStyle = { background: 'transparent', color, border: 0, padding: '0 4px', cursor: 'pointer', font: 'inherit', WebkitAppRegion: 'no-drag' } as React.CSSProperties;
  return <>
    <div data-fcm-header-controls="" style={{ display: 'flex', alignItems: 'center', flexShrink: 0, fontSize: '10px', color, WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button ref={live} type="button" aria-label="Live status" aria-expanded={popup === 'stats'} style={buttonStyle}
        onMouseEnter={() => open('stats')} onMouseLeave={() => setPopup(p => p === 'stats' ? null : p)}
        onFocus={() => open('stats')} onBlur={() => setPopup(p => p === 'stats' ? null : p)}
        onClick={() => open('stats')}>{connected ? '● Live' : '● Offline'}</button>
      {(alwaysOnline || (alwaysServer && bindingId)) && <span data-fcm-pinned-stats="" style={{ maxWidth: '32vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[alwaysOnline && onlineText, alwaysServer && bindingId && serverText].filter(Boolean).join(' · ')}>
        {[alwaysOnline && `${connected && stats ? stats.totalOnline : '—'} online`, alwaysServer && bindingId && `${connected && stats?.observedPlayers != null ? stats.observedPlayers : '—'} server`].filter(Boolean).join(' · ')}
      </span>}
      <button ref={arrow} type="button" aria-label="Overlay actions" aria-haspopup="menu" aria-expanded={popup === 'actions'} style={buttonStyle}
        onClick={() => popup === 'actions' ? setPopup(null) : open('actions')}>{popup === 'actions' ? '▴' : '▾'}</button>
    </div>
    {popup && createPortal(<div ref={panel} data-fcm-header-popup={popup} role={popup === 'actions' ? 'menu' : 'tooltip'}
      style={{ position: 'fixed', ...anchor, zIndex: 10000, maxWidth: 'calc(100vw - 8px)', padding: '8px', background, color, border: `1px solid ${color}`, fontSize: '12px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onKeyDown={event => {
        if (popup !== 'actions' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }}>
      {popup === 'stats' ? <><div>{onlineText}</div>{bindingId && <div>{serverText}</div>}</>
        : ([['Refresh', onRefresh], ['Settings', onSettings], ['Minimize', onMinimize]] as const).filter(([, action]) => action).map(([label, action]) =>
          <button key={label} type="button" role="menuitem" style={{ ...buttonStyle, display: 'block', padding: '6px 12px', width: '100%', textAlign: 'left' }}
            onClick={() => { setPopup(null); action?.(); }}>{label}</button>)}
    </div>, document.body)}
  </>;
}
