import { describe, expect, it } from 'vitest';
import { FONT_OPTIONS, normalizeFontId, resolveFontFamily } from '../overlayFonts';

describe('overlay font preferences', () => {
  it('preserves theme typography for existing or invalid preferences', () => {
    for (const value of [undefined, null, '', 'missing', {}, 'url(https://example.com/font)']) {
      expect(normalizeFontId(value)).toBe('theme');
      expect(resolveFontFamily(value, 'original-theme-font')).toBe('original-theme-font');
    }
  });
  it('keeps every explicit font independent from the selected color theme', () => {
    for (const option of FONT_OPTIONS.filter(font => font.id !== 'theme')) {
      expect(resolveFontFamily(option.id, 'amber-font')).toBe(resolveFontFamily(option.id, 'white-font'));
      expect(resolveFontFamily(option.id, 'amber-font')).toMatch(/sans-serif|monospace/);
    }
  });
});
