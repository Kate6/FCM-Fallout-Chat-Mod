export type ServerRow = { id: string; channelId: string; content: string; username: string; source: string; timestamp?: string; serverDisplayId?: string };

export function serverRoomLabel(privileged: boolean, channelId: string, ownChannelId: string | null, displayId?: string): string {
  if (!privileged) return 'Server';
  if (channelId === ownChannelId) return 'Your server';
  return displayId && /^[1-9][0-9]{0,19}$/.test(displayId) ? `Server · ${displayId}` : 'Server';
}

export function readModeratorRows(value: unknown): ServerRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 500).filter((row): row is ServerRow => {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    return typeof r.id === 'string' && r.id.length <= 200
      && typeof r.channelId === 'string' && /^server:r:[a-z0-9-]{1,64}$/.test(r.channelId)
      && typeof r.serverDisplayId === 'string' && /^[1-9][0-9]{0,19}$/.test(r.serverDisplayId)
      && r.source === 'server' && typeof r.content === 'string' && r.content.length <= 10000
      && typeof r.username === 'string' && typeof r.timestamp === 'string';
  });
}

export function mergeModeratorRows<T extends ServerRow>(previous: T[], incoming: T[]): T[] {
  const rows = new Map(previous.map(row => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? '')).slice(-500);
}

export function normalizeMutedRooms(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string =>
    typeof id === 'string' && /^server:r:[a-z0-9-]{1,64}$/.test(id)))].slice(-500) : [];
}

export function readMutedRoomPreferences(value: unknown): { ids: string[]; labels: Record<string, string> } {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const ids = normalizeMutedRooms(record?.ids ?? value);
  const raw = record?.labels && typeof record.labels === 'object' ? record.labels as Record<string, unknown> : {};
  const labels: Record<string, string> = {};
  for (const id of ids) if (typeof raw[id] === 'string' && /^[1-9][0-9]{0,19}$/.test(raw[id])) labels[id] = raw[id];
  return { ids, labels };
}

export function shouldMarkChannelUnread(input: { self: boolean; replay: boolean; duplicate: boolean; muted: boolean; visible: boolean; inView: boolean }): boolean {
  return !input.self && !input.replay && !input.duplicate && !input.muted && !(input.visible && input.inView);
}
