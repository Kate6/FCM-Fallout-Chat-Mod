// Local font stacks only: no network request or installed-font enumeration.
export const SYSTEM_FONT = '"Segoe UI", system-ui, sans-serif';
export const MONOSPACE_FONT = '"Courier New", Courier, monospace';
export const FONT_OPTIONS = [
  { id: 'theme', label: 'Theme default', family: null },
  { id: 'system', label: 'System sans', family: SYSTEM_FONT },
  { id: 'arial', label: 'Arial', family: 'Arial, "Liberation Sans", sans-serif' },
  { id: 'verdana', label: 'Verdana', family: 'Verdana, "DejaVu Sans", sans-serif' },
  { id: 'mono', label: 'Monospace', family: MONOSPACE_FONT },
] as const;
export type FontId = (typeof FONT_OPTIONS)[number]['id'];
export const FONT_SAMPLE = 'The quick brown fox — Il1 O0 0123456789 · Café ☢';
export const OVERLAY_SETTINGS_EVENT = 'fcm-overlay-settings-changed';

export function normalizeFontId(value: unknown): FontId {
  return FONT_OPTIONS.find(option => option.id === value)?.id ?? 'theme';
}

export function resolveFontFamily(value: unknown, themeFamily: string): string {
  return FONT_OPTIONS.find(option => option.id === normalizeFontId(value))?.family ?? themeFamily;
}
