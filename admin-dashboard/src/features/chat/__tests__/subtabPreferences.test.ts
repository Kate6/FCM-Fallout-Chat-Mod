import { describe, expect, it } from 'vitest';
import { defaultTabTransition, emptyTabPreferences, fallbackTab, hideTab, moveTab, orderedTabs, parseTabPreferences, replacementTab, tabKey, tabPreferenceScope } from '../subtabPreferences';

const tabs = [{ id: 'general', name: 'General' }, { id: 'trading', name: 'Trading' }, { id: 'server:r:one', name: 'Server' }, { id: 'events', name: 'Events' }];
describe('overlay subtab preferences', () => {
  it('shows all channels with fresh or reset settings', () => {
    expect(emptyTabPreferences().hidden).toEqual([]);
    expect(orderedTabs(tabs, 'fo76', emptyTabPreferences())).toHaveLength(tabs.length);
  });
  it('follows a replacement Server only when already viewing it and never revives hidden Server', () => {
    expect(replacementTab(tabs, emptyTabPreferences(), 'server:r:old')).toBe(tabs[2]);
    expect(replacementTab(tabs, emptyTabPreferences(), 'removed-channel')).toBe(tabs[0]);
    expect(replacementTab(tabs, { ...emptyTabPreferences(), hidden: ['server'] }, 'server:r:old')).toBe(tabs[0]);
    expect(replacementTab(tabs.filter(t => !t.id.startsWith('server:')), emptyTabPreferences(), 'server:r:old')).toBe(tabs[0]);
  });
  it('selects startup defaults once, waits for Server, and never steals focus on repeated confirmations', () => {
    const prefs = { ...emptyTabPreferences(), defaultKey: 'server' };
    const absent = tabs.filter(t => !t.id.startsWith('server:'));
    expect(defaultTabTransition(absent, prefs, false, false)).toMatchObject({ select: true, target: tabs[0], serverAvailable: false });
    expect(defaultTabTransition(tabs, prefs, true, false)).toMatchObject({ select: true, target: tabs[2] });
    expect(defaultTabTransition(tabs, prefs, true, true).select).toBe(false);
    const hopped = tabs.map(t => t.id.startsWith('server:') ? { ...t, id: 'server:r:next' } : t);
    expect(defaultTabTransition(hopped, prefs, true, true).select).toBe(false);
    expect(defaultTabTransition(tabs, { ...prefs, defaultKey: 'trading' }, false, false).target).toBe(tabs[1]);
    expect(defaultTabTransition(tabs, { ...prefs, hidden: ['server'] }, true, false).select).toBe(false);
    expect(defaultTabTransition(tabs, { ...prefs, hidden: tabs.map(t => tabKey(t.id)) }, false, false).target).toBeUndefined();
  });
  it('defaults to General, Server, Trading without mutating input', () => {
    expect(orderedTabs(tabs, 'fo76', emptyTabPreferences()).map(t => t.name)).toEqual(['General', 'Server', 'Trading', 'Events']);
    expect(tabs[1].name).toBe('Trading');
  });
  it('moves both directions and retains Server across absence and room changes', () => {
    let prefs = moveTab(emptyTabPreferences(), 'fo76', tabs, 'server', 'events');
    expect(orderedTabs(tabs, 'fo76', prefs).map(t => tabKey(t.id))).toEqual(['general', 'trading', 'events', 'server']);
    prefs = moveTab(prefs, 'fo76', tabs.filter(t => !t.id.startsWith('server:')), 'events', 'general');
    expect(prefs.orders.fo76).toContain('server');
    const restored = orderedTabs([...tabs.slice(0, 2), { id: 'server:r:two', name: 'Server' }, tabs[3]], 'fo76', prefs);
    expect(restored[restored.length - 1]?.id).toBe('server:r:two');
  });
  it('appends new channels without changing saved ordering', () => {
    const prefs = moveTab(emptyTabPreferences(), 'fo76', tabs, 'trading', 'general');
    expect(orderedTabs([...tabs, { id: 'new', name: 'New' }], 'fo76', prefs).map(t => t.id)).toEqual(['trading', 'general', 'server:r:one', 'events', 'new']);
  });
  it('hides defaults, unhides General, and retains logical Server hiding', () => {
    const prefs = { ...emptyTabPreferences(), defaultKey: 'server', hidden: ['general'] };
    const next = hideTab(prefs, tabs[2], tabs);
    expect(next.defaultKey).toBe('general'); expect(next.hidden).toEqual(['server']);
    expect(next.hidden).toContain(tabKey('server:r:next'));
  });
  it('hiding General chooses a visible fallback; all hidden resolves to aggregate', () => {
    const prefs = hideTab({ ...emptyTabPreferences(), defaultKey: 'general' }, tabs[0], tabs);
    expect(prefs.defaultKey).toBe('trading');
    expect(fallbackTab(tabs, tabs.map(t => tabKey(t.id)))).toBeUndefined();
  });
  it('rejects malformed storage and deduplicates bounded keys', () => {
    expect(parseTabPreferences('{')).toBeNull(); expect(parseTabPreferences('{"version":2}')).toBeNull();
    expect(parseTabPreferences(JSON.stringify({ version: 1, hidden: ['server', 'server', 4], orders: { a: ['b', 'b'] } }))).toEqual({ version: 1, hidden: ['server'], orders: { a: ['b'] }, defaultKey: null });
    expect(parseTabPreferences('{"version":1,"orders":{"__proto__":["bad"]}}')?.orders).toEqual({});
    expect(orderedTabs(tabs, 'constructor', emptyTabPreferences())).toHaveLength(tabs.length);
  });
  it('separates accounts and origins without storing tokens', () => {
    expect(tabPreferenceScope('https://dev.falloutchatmod.com/path', 'one')).toBe(tabPreferenceScope('https://dev.falloutchatmod.com', 'one'));
    expect(tabPreferenceScope('https://dev.falloutchatmod.com', 'one')).not.toBe(tabPreferenceScope('https://falloutchatmod.com', 'one'));
    expect(tabPreferenceScope('https://dev.falloutchatmod.com', 'one')).not.toBe(tabPreferenceScope('https://dev.falloutchatmod.com', 'two'));
    expect(tabPreferenceScope('bad', 'one')).toBeNull(); expect(tabPreferenceScope('https://dev.falloutchatmod.com', undefined)).toBeNull();
  });
});
