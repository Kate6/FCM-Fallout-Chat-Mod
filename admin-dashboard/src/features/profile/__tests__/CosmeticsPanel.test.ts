import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, '..', 'CosmeticsPanel.tsx'), 'utf8');

describe('CosmeticsPanel colour resets', () => {
  it('provides matching reset actions for name and supporter-star colours', () => {
    expect(source.match(/Reset to default/g)).toHaveLength(2);
    expect(source).toContain("save.mutate({ colorPresetId: null, customColorHex: null })");
    expect(source).toContain("save.mutate({ starColorPresetId: null })");
  });

  it('uses one fixed-height action-button style with spacing above resets', () => {
    expect(source).toContain("minHeight: '34px'");
    expect(source.match(/style=\{\{ \.\.\.btn, marginTop: '12px', fontSize: '12px' \}\}/g)).toHaveLength(2);
  });
});
