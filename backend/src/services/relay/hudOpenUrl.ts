export const HUD_OPEN_URL_CONTROL = 'FCMCTL/1/OPENURL:';

export function parseHudOpenUrlControl(body: string): string | null {
  if (!body.startsWith(HUD_OPEN_URL_CONTROL)) return null;
  const encoded = body.slice(HUD_OPEN_URL_CONTROL.length);
  if (!encoded || encoded.length > 2_048) return null;
  try {
    const value = decodeURIComponent(encoded);
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return null;
    if (url.href.length > 1_024) return null;
    return url.href;
  } catch {
    return null;
  }
}
