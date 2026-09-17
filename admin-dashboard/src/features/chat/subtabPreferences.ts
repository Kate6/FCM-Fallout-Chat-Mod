export interface TabChannel { id: string; name: string; parentId?: string | null }
export interface SubtabPreferences {
  version: 1;
  orders: Record<string, string[]>;
  hidden: string[];
  defaultKey: string | null;
}
export const tabKey = (id: string): string => id.startsWith('server:') ? 'server' : id;
export const emptyTabPreferences = (): SubtabPreferences => ({ version: 1, orders: {}, hidden: [], defaultKey: null });
const savedOrder = (prefs: SubtabPreferences, parent: string): string[] => Object.prototype.hasOwnProperty.call(prefs.orders, parent) ? prefs.orders[parent] : [];
const keys = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256))].slice(0, 256) : [];
export function parseTabPreferences(raw: string | null): SubtabPreferences | null {
  if (!raw || raw.length > 131072) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !('version' in v) || v.version !== 1) return null;
    const orders: Record<string, string[]> = {};
    if ('orders' in v && v.orders && typeof v.orders === 'object') {
      for (const [parent, order] of Object.entries(v.orders).slice(0, 128)) {
        if (parent !== '__proto__' && parent !== 'constructor' && parent !== 'prototype') orders[parent] = keys(order);
      }
    }
    return { version: 1, orders, hidden: keys('hidden' in v ? v.hidden : []),
      defaultKey: 'defaultKey' in v && typeof v.defaultKey === 'string' && v.defaultKey.length <= 256 ? v.defaultKey : null };
  } catch { return null; }
}
export function tabPreferenceScope(base: string | undefined, account: string | undefined): string | null {
  if (!base || !account) return null;
  try { return `fcm-subtabs-v1:${encodeURIComponent(new URL(base).origin)}:${encodeURIComponent(account)}`; }
  catch { return null; }
}
export function orderedTabs<T extends TabChannel>(tabs: T[], parent: string, prefs: SubtabPreferences): T[] {
  const base = tabs.filter(t => tabKey(t.id) !== 'server');
  const server = tabs.find(t => tabKey(t.id) === 'server');
  if (server) { const general = base.findIndex(t => t.name.toLowerCase() === 'general'); base.splice(general < 0 ? 0 : general + 1, 0, server); }
  const saved = savedOrder(prefs, parent);
  return [...saved.flatMap(key => base.filter(t => tabKey(t.id) === key)), ...base.filter(t => !saved.includes(tabKey(t.id)))];
}
export function moveTab(prefs: SubtabPreferences, parent: string, tabs: TabChannel[], source: string, target: string): SubtabPreferences {
  if (source === target) return prefs;
  // Keep unavailable keys (especially Server) in their saved slots.
  const order = [...savedOrder(prefs, parent)];
  for (const tab of orderedTabs(tabs, parent, prefs)) if (!order.includes(tabKey(tab.id))) order.push(tabKey(tab.id));
  const from = order.indexOf(source), to = order.indexOf(target);
  if (from < 0 || to < 0) return prefs;
  order.splice(from, 1); order.splice(to, 0, source);
  return { ...prefs, orders: { ...prefs.orders, [parent]: order } };
}
export function fallbackTab(tabs: TabChannel[], hidden: string[]): TabChannel | undefined {
  const visible = tabs.filter(t => !hidden.includes(tabKey(t.id)));
  return visible.find(t => t.name.toLowerCase() === 'general') ?? visible[0];
}
export function replacementTab(tabs: TabChannel[], prefs: SubtabPreferences, previousId: string): TabChannel | undefined {
  const nextServer = previousId.startsWith('server:') && !prefs.hidden.includes('server')
    ? tabs.find(t => t.id.startsWith('server:')) : undefined;
  return nextServer ?? fallbackTab(tabs, prefs.hidden);
}
export function defaultTabTransition(tabs: TabChannel[], prefs: SubtabPreferences, started: boolean, serverWasAvailable: boolean) {
  const serverAvailable = tabs.some(t => tabKey(t.id) === 'server');
  const select = !started || (prefs.defaultKey === 'server' && serverAvailable && !serverWasAvailable && !prefs.hidden.includes('server'));
  const target = tabs.find(t => tabKey(t.id) === prefs.defaultKey && !prefs.hidden.includes(tabKey(t.id))) ?? fallbackTab(tabs, prefs.hidden);
  return { select, target, serverAvailable };
}
export function hideTab(prefs: SubtabPreferences, tab: TabChannel, tabs: TabChannel[]): SubtabPreferences {
  const key = tabKey(tab.id);
  let hidden = [...new Set([...prefs.hidden, key])];
  let defaultKey = prefs.defaultKey;
  if (defaultKey === key) {
    const general = tabs.find(t => t.name.toLowerCase() === 'general' && tabKey(t.id) !== key);
    if (general) hidden = hidden.filter(k => k !== tabKey(general.id));
    defaultKey = tabKey((general ?? fallbackTab(tabs, hidden))?.id ?? '') || null;
  }
  return { ...prefs, hidden, defaultKey };
}
