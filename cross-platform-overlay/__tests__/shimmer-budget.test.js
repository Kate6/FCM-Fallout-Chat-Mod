import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../admin-dashboard/src/features/chat/nameEffects.css'), 'utf8');
it('uses one infrequent color-only highlight per name, not per-letter animated shadows', () => {
  const frames = css.match(/@keyframes fcm-shimmer-highlight \{([\s\S]*?)\n\}/)?.[1];
  expect(frames).toBeDefined();
  expect(frames).not.toMatch(/text-shadow|filter|opacity|transform/);
  expect(css).toContain('animation: fcm-shimmer-highlight 8s steps(1, end) infinite;');
  expect(css).not.toContain('@keyframes fcm-shimmer-letter');
  const letters = css.match(/\.fcm-name-fx--shimmer \.fcm-shimmer-letter \{([\s\S]*?)\n\}/)?.[1];
  expect(letters).toContain('color: inherit;');
  expect(letters).not.toContain('animation:');
});
