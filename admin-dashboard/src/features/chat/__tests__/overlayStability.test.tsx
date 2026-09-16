import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const get = vi.hoisted(() => vi.fn());
vi.mock('../../../services/api', () => ({ api: { get, post: vi.fn(), delete: vi.fn() } }));
vi.mock('../EmojiPicker', () => ({ default: () => null, extractEmojiTokens: () => [] }));
vi.mock('../GifPicker', () => ({ default: () => null }));
vi.mock('../components/ChatEmbedCard', () => ({ ChatEmbedCard: () => null }));
import ChatOverlay, { resetRememberedChatSelection } from '../ChatOverlay';
import { OVERLAY_SETTINGS_EVENT } from '../overlayFonts';

type Frame = { type: string; payload: Record<string, unknown> };
const sockets: TestSocket[] = [];
class TestSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sent: Frame[] = [];
  constructor() { sockets.push(this); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.onopen?.(); }
  close() { this.readyState = 3; this.onclose?.({ code: 1006 }); }
  emit(frame: Frame) { this.onmessage?.({ data: JSON.stringify(frame) }); }
  addEventListener() {}
  removeEventListener() {}
}

let visibility: (visible: boolean) => void;
let gameState: (running: boolean) => void;
let command: (command: string) => void;
let client: QueryClient;
const channels = [{ id: 'fo76', name: 'Fallout 76', parentId: null, children: [
  { id: 'general', name: 'General', parentId: 'fo76' },
  { id: 'trading', name: 'Trading', parentId: 'fo76' },
  { id: 'events', name: 'Events', parentId: 'fo76' },
] }];

beforeEach(() => {
  sockets.length = 0;
  resetRememberedChatSelection();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('__FCM_OVERLAY_SHELL__', { title: 'Fallout Chat Mod', relayBase: 'http://localhost' });
  vi.stubGlobal('relayBridge', {
    onVisibility: (cb: typeof visibility) => { visibility = cb; return () => {}; },
    onGameState: (cb: typeof gameState) => { gameState = cb; return () => {}; },
    onCommand: (cb: typeof command) => { command = cb; return () => {}; },
    logDiag: vi.fn(), notifyChatActive: vi.fn(), notifyInputFocusState: vi.fn(),
  });
  vi.stubGlobal('WebSocket', TestSocket);
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify({
    data: url.includes('ws-ticket') ? { ticket: 'local-test-ticket' } : [],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
  get.mockImplementation((path: string) => Promise.resolve(path === '/api/channels' ? channels
    : path === '/api/block' ? { blocked: [] }
    : path.startsWith('/api/parties/invites') ? { invites: [] }
    : path.startsWith('/api/parties') ? { parties: [] } : []));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => { cleanup(); client?.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function mount() {
  const result = render(<QueryClientProvider client={client}><MemoryRouter><Routes>
    <Route element={<Outlet context={{ user: { id: 'alice', username: 'Alice', role: 'user' } }} />}>
      <Route path="/" element={<ChatOverlay />} />
    </Route>
  </Routes></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(sockets).toHaveLength(1));
  await screen.findByText('Trading');
  return result;
}

function history(socket: TestSocket, id = 'message-1', content = 'Existing chat stays here') {
  socket.emit({ type: 'chat:history', payload: { messages: [{ id, content, username: 'Bob', user_id: 'bob',
    channel_id: 'general', created_at: '2026-09-16T12:00:00Z' }] } });
}

describe('overlay lifecycle and navigation', () => {
  it('does not restart a handshake for repeated visibility notifications', async () => {
    await mount();
    act(() => gameState(true));
    for (let i = 0; i < 5; i++) {
      await act(async () => visibility(true));
    }
    expect(sockets).toHaveLength(1);
  });

  it('updates fonts in place, retaining the composer and existing messages', async () => {
    const { container } = await mount();
    act(() => { sockets[0].open(); history(sockets[0]); });
    await screen.findByText('Existing chat stays here');
    const composer = container.querySelector<HTMLElement>('[contenteditable="true"]')!;
    expect(composer).not.toBeNull();
    composer.textContent = 'unsent draft';
    fireEvent.input(composer);
    act(() => {
      localStorage.setItem('fcm_web_overlay_settings', JSON.stringify({ fontId: 'verdana', themeId: 'amber' }));
      window.dispatchEvent(new Event(OVERLAY_SETTINGS_EVENT));
    });
    expect(container.querySelector('[contenteditable="true"]')).toBe(composer);
    expect(composer.textContent).toBe('unsent draft');
    expect(screen.getByText('Existing chat stays here')).toBeInTheDocument();
    expect(sockets).toHaveLength(1);
    expect(getComputedStyle(composer).fontFamily).toContain('Verdana');
  });

  it('ignores stale close and message callbacks after ten reconnects', async () => {
    await mount();
    act(() => { sockets[0].open(); history(sockets[0]); });
    await screen.findByText('Existing chat stays here');
    for (let i = 0; i < 10; i++) {
      const old = sockets[i];
      act(() => old.close());
      await waitFor(() => expect(sockets).toHaveLength(i + 2));
      act(() => {
        sockets[i + 1].open();
        history(sockets[i + 1]);
        old.close();
        history(old, `stale-${i}`, 'Stale connection content');
      });
      expect(screen.queryByText('Stale connection content')).not.toBeInTheDocument();
      expect(screen.getAllByText('Existing chat stays here')).toHaveLength(1);
    }
    expect(sockets).toHaveLength(11);
  });

  it('cycles exactly once and skips hidden channels', async () => {
    localStorage.setItem('fcm_web_overlay_settings', JSON.stringify({ channelFilters: ['Trading'] }));
    // Trading is deliberately absent in this case.
    render(<QueryClientProvider client={client}><MemoryRouter><Routes><Route element={<Outlet context={{ user: { id: 'alice', role: 'user' } }} />}>
      <Route path="/" element={<ChatOverlay />} />
    </Route></Routes></MemoryRouter></QueryClientProvider>);
    await screen.findByText('Events');
    act(() => command('channel:next'));
    expect(document.title).toContain('Events');
    act(() => command('channel:prev'));
    expect(document.title).toContain('General');
  });

  it('does not reload known channel history when channel metadata changes', async () => {
    await mount();
    act(() => { sockets[0].open(); history(sockets[0]); });
    await screen.findByText('Existing chat stays here');
    const before = sockets[0].sent.filter(frame => frame.type === 'chat:history').length;
    act(() => client.setQueryData(['channels'], [{ ...channels[0], color: '#00ffff' }]));
    await act(async () => {});
    expect(sockets[0].sent.filter(frame => frame.type === 'chat:history')).toHaveLength(before);
    expect(screen.getByText('Existing chat stays here')).toBeInTheDocument();
  });

  it('back-applies cosmetics from a HUD-origin live message to retained overlay rows', async () => {
    const { container } = await mount();
    const socket = sockets[0];
    act(() => {
      socket.open();
      socket.emit({ type: 'chat:history', payload: { messages: [{
        id: 'old-hud-message', content: 'Old HUD message', username: 'Devotek', user_id: 'devotek-user',
        channel_id: 'general', source: 'relay', created_at: '2026-09-16T12:00:00Z',
      }] } });
    });
    await screen.findByText('Old HUD message');
    expect(container.querySelectorAll('[data-fcm-supporter-star="true"]')).toHaveLength(0);

    act(() => socket.emit({ type: 'chat:message', payload: {
      id: 'new-hud-message', content: 'New HUD message', username: 'Devotek', userId: 'devotek-user',
      channelId: 'general', source: 'relay', timestamp: '2026-09-16T12:01:00Z',
      effectId: 'shimmer', badges: ['supporter'], starColor: '#70F835',
    } }));

    await screen.findByText('New HUD message');
    expect(container.querySelectorAll('[data-fcm-supporter-star="true"]')).toHaveLength(2);
    expect(container.querySelectorAll('.fcm-name-fx--shimmer')).toHaveLength(2);
  });

  it('keeps a pending older-page request when an unrelated history reply arrives', async () => {
    const { container } = await mount();
    const socket = sockets[0];
    act(() => {
      socket.open();
      socket.emit({ type: 'chat:history', payload: { messages: Array.from({ length: 300 }, (_, i) => ({
        id: `general-${i}`, content: `Current message ${i}`, username: 'Bob', user_id: 'bob', channel_id: 'general',
        created_at: new Date(Date.UTC(2026, 8, 16, 12, i)).toISOString(),
      })) } });
    });
    const last = await screen.findByText('Current message 299');
    const list = last.closest('.fcm-scrollbar')!;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 5000 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 500 });
    fireEvent.scroll(list);
    const lazyRequests = () => socket.sent.filter(frame => frame.type === 'chat:history' && frame.payload.offset === 300);
    expect(lazyRequests()).toHaveLength(1);
    act(() => socket.emit({ type: 'chat:history', payload: { messages: [{
      id: 'trading-late', channel_id: 'trading', content: 'Delayed Trading history', username: 'Bob', created_at: '2026-09-15T12:00:00Z',
    }] } }));
    fireEvent.scroll(list);
    expect(lazyRequests()).toHaveLength(1);
    act(() => history(socket, 'general-older', 'Older General page'));
    // This page's timestamp is at the captured boundary, so it belongs to General.
    await screen.findByText('Older General page');
    act(() => command('channel:next'));
    await screen.findByText('Delayed Trading history');
    expect(container.querySelector('[contenteditable="true"]')).not.toBeNull();
  });
});
