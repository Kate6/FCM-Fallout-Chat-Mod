export const keybindFields = ['openKey', 'channelNextKey', 'channelPrevKey', 'scrollUpKey',
  'scrollDownKey', 'scrollBottomKey', 'activateLinkKey', 'hideKey'] as const;
export type KeybindField = typeof keybindFields[number];
export type KeybindProfile = Record<KeybindField, string>;

export const defaultKeybinds: KeybindProfile = {
  openKey: 'INSERT', channelNextKey: 'PAGEDOWN', channelPrevKey: 'PAGEUP',
  scrollUpKey: 'UP', scrollDownKey: 'DOWN', scrollBottomKey: '', activateLinkKey: 'F8', hideKey: 'DELETE',
};

export const supportedKeys = ['', 'ENTER', 'INSERT', 'DELETE', 'HOME', 'END', 'PAGEUP', 'PAGEDOWN',
  'UP', 'DOWN', 'LEFT', 'RIGHT', 'ESCAPE', 'TAB', 'SPACE',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ...'0123456789'.split('')];

export function normalizeKeybinds(value: unknown): KeybindProfile {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const output = { ...defaultKeybinds };
  for (const field of keybindFields) {
    const raw = typeof input[field] === 'string' ? input[field].trim() : output[field];
    if (raw === '' && (field === 'scrollBottomKey' || field === 'hideKey')) output[field] = '';
    else if (supportedKeys.includes(raw.toUpperCase())) output[field] = raw.toUpperCase();
    else throw new Error(`Unsupported ${field}: ${raw}`);
  }
  const active = keybindFields.map(field => output[field]).filter(Boolean);
  if (new Set(active).size !== active.length) throw new Error('Each active action must use a different key');
  return output;
}

export function applyKeybindsToIni(source: string, profile: KeybindProfile): string {
  let result = source;
  for (const field of keybindFields) {
    const pattern = new RegExp(`^${field}=.*$`, 'm');
    if (!pattern.test(result)) throw new Error(`FCMChat.ini is missing ${field}`);
    result = result.replace(pattern, `${field}=${profile[field]}`);
  }
  return result;
}

export function browserKey(token: string): { code: string; key: string; keyCode: number } | null {
  const key = token.toUpperCase();
  const named: Record<string, [string, string, number]> = {
    ENTER: ['Enter', 'Enter', 13], INSERT: ['Insert', 'Insert', 45], DELETE: ['Delete', 'Delete', 46], HOME: ['Home', 'Home', 36], END: ['End', 'End', 35],
    PAGEUP: ['PageUp', 'PageUp', 33], PAGEDOWN: ['PageDown', 'PageDown', 34], UP: ['ArrowUp', 'ArrowUp', 38],
    DOWN: ['ArrowDown', 'ArrowDown', 40], LEFT: ['ArrowLeft', 'ArrowLeft', 37], RIGHT: ['ArrowRight', 'ArrowRight', 39],
    ESCAPE: ['Escape', 'Escape', 27], TAB: ['Tab', 'Tab', 9], SPACE: ['Space', ' ', 32],
  };
  if (named[key]) return { code: named[key][0], key: named[key][1], keyCode: named[key][2] };
  if (/^F([1-9]|1[0-2])$/.test(key)) return { code: key, key, keyCode: 111 + Number(key.slice(1)) };
  if (/^[A-Z]$/.test(key)) return { code: `Key${key}`, key: key.toLowerCase(), keyCode: key.charCodeAt(0) };
  if (/^[0-9]$/.test(key)) return { code: `Digit${key}`, key, keyCode: key.charCodeAt(0) };
  return null;
}
