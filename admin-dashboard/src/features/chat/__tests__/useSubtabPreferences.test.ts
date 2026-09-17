import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSubtabPreferences } from '../useSubtabPreferences';
import { emptyTabPreferences } from '../subtabPreferences';
const tabs = [{ id: 'general', name: 'General' }, { id: 'trading', name: 'Trading' }];
describe('account scoped tab preference lifecycle', () => {
  const values = new Map<string, string>();
  beforeEach(() => { values.clear(); vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  }); });
  afterEach(() => vi.unstubAllGlobals());
  it('imports legacy hiding only once and persists explicit changes', () => {
    const { result, unmount } = renderHook(() => useSubtabPreferences('account-a', tabs, ['Trading']));
    expect(result.current.prefs.hidden).toEqual(['trading']);
    act(() => result.current.update({ ...emptyTabPreferences(), defaultKey: 'trading' }));
    unmount();
    const next = renderHook(() => useSubtabPreferences('account-a', tabs, ['Trading']));
    expect(next.result.current.prefs.hidden).toEqual([]);
    expect(next.result.current.prefs.defaultKey).toBe('trading');
  });
  it('does not carry defaults across account changes or accept stale callbacks', () => {
    const { result, rerender } = renderHook(({ scope }) => useSubtabPreferences(scope, tabs, []), { initialProps: { scope: 'account-a' as string | null } });
    act(() => result.current.update({ ...emptyTabPreferences(), defaultKey: 'trading' }));
    const staleUpdate = result.current.update;
    rerender({ scope: 'account-b' });
    expect(result.current.prefs.defaultKey).toBeNull();
    act(() => staleUpdate({ ...emptyTabPreferences(), hidden: ['general'] }));
    expect(result.current.prefs.hidden).toEqual([]);
    rerender({ scope: null });
    expect(result.current.ready).toBe(false);
    expect(result.current.prefs.defaultKey).toBeNull();
  });
  it('never imports another account’s legacy hidden channels', () => {
    const { result, rerender } = renderHook(({ scope }) => useSubtabPreferences(scope, tabs, ['Trading']), { initialProps: { scope: 'fcm:dev:account-a' } });
    expect(result.current.prefs.hidden).toEqual(['trading']);
    rerender({ scope: 'fcm:dev:account-b' });
    expect(result.current.prefs.hidden).toEqual([]);
    rerender({ scope: 'fcm:dev:account-a' });
    expect(result.current.prefs.hidden).toEqual(['trading']);
  });
  it('waits for channels before migration and tolerates blocked storage', () => {
    const { result, rerender } = renderHook(({ channels }) => useSubtabPreferences('account', channels, ['Trading']), { initialProps: { channels: [] as typeof tabs } });
    expect(result.current.ready).toBe(false);
    rerender({ channels: tabs }); expect(result.current.prefs.hidden).toEqual(['trading']);
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    act(() => result.current.update(emptyTabPreferences()));
    expect(result.current.prefs.hidden).toEqual([]); spy.mockRestore();
  });
});
