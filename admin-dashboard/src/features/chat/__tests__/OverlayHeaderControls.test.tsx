import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverlayHeaderControls, readOnlineStats } from '../OverlayHeaderControls';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const props = { connected: true, socket: null, scope: 'alice', bindingId: null,
  alwaysOnline: false, alwaysServer: false, color: '#fff', background: '#000', onSettings: vi.fn() };
describe('overlay header', () => {
  it('rejects malformed counts without interpreting unknown as zero', () => {
    expect(readOnlineStats({ totalOnline: 4, observedPlayers: null, bindingId: null })?.totalOnline).toBe(4);
    for (const value of [null, {}, { totalOnline: -1 }, { totalOnline: 3, observedPlayers: 25, bindingId: 'b' }]) expect(readOnlineStats(value)).toBeNull();
  });
  it('reverses arrow, supports keyboard navigation and Escape, and invokes each action', () => {
    const refresh = vi.fn(), settings = vi.fn(), minimize = vi.fn();
    render(<OverlayHeaderControls {...props} onRefresh={refresh} onSettings={settings} onMinimize={minimize} />);
    const arrow = screen.getByRole('button', { name: 'Overlay actions' });
    expect(arrow.style.width).toBe('16px');
    expect(arrow.style.minWidth).toBe('16px');
    expect(arrow.querySelector('svg')?.getAttribute('width')).toBe('12');
    expect(arrow.querySelector('svg')?.getAttribute('height')).toBe('12');
    expect(arrow.style.height).toBe('16px');
    expect(arrow.style.border).toBe('0px');
    expect(arrow.style.alignItems).toBe('center');
    expect(arrow.getAttribute('title')).toBe('Overlay actions');
    fireEvent.click(arrow); expect(arrow.querySelector('polyline')?.getAttribute('points')).toBe('-4.5,2.25 0,-2.25 4.5,2.25');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Refresh' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Settings' }));
    fireEvent.keyDown(document, { key: 'Escape' }); expect(arrow.querySelector('polyline')?.getAttribute('points')).toBe('-4.5,-2.25 0,2.25 4.5,-2.25');
    for (const label of ['Refresh', 'Settings', 'Minimize']) { fireEvent.click(arrow); fireEvent.click(screen.getByRole('menuitem', { name: label })); }
    expect(refresh).toHaveBeenCalledOnce(); expect(settings).toHaveBeenCalledOnce(); expect(minimize).toHaveBeenCalledOnce();
  });
  it('shows hover stats, rejects foreign bindings, polls only while requested, and cleans up', () => {
    vi.useFakeTimers();
    const socket = new EventTarget() as WebSocket;
    Object.defineProperty(socket, 'readyState', { value: 1 }); socket.send = vi.fn();
    const { unmount } = render(<OverlayHeaderControls {...props} socket={socket} bindingId="b" />);
    expect(socket.send).not.toHaveBeenCalled();
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Live status' }));
    const requestId = JSON.parse(vi.mocked(socket.send).mock.calls[0][0] as string).payload.requestId;
    const reply = (bindingId: string) => act(() => socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'presence:stats', payload: { requestId, bindingId, totalOnline: 12, observedPlayers: 8 } }) })));
    reply('foreign'); expect(screen.queryByText('12 FCM Online')).toBeNull();
    reply('b'); expect(screen.getByText('12 FCM Online')).toBeTruthy(); expect(screen.getByText('8 observed on Server')).toBeTruthy();
    unmount(); act(() => vi.advanceTimersByTime(60_000)); expect(socket.send).toHaveBeenCalledOnce();
  });
  it('pins stats only when opted in and clears the popup on account change', () => {
    const { rerender } = render(<OverlayHeaderControls {...props} />);
    expect(document.querySelector('[data-fcm-pinned-stats]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Overlay actions' }));
    rerender(<OverlayHeaderControls {...props} scope="bob" alwaysOnline />);
    expect(screen.queryByRole('menu')).toBeNull(); expect(document.querySelector('[data-fcm-pinned-stats]')).toBeTruthy();
  });
});
