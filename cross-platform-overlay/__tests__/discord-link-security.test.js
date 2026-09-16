import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const main = readFileSync(resolve(import.meta.dirname, '..', 'main.js'), 'utf8');
const shell = readFileSync(resolve(import.meta.dirname, '..', 'src/shell.ts'), 'utf8');

describe('Discord link identity refresh', () => {
  it('uses a unique OAuth start URL on every link attempt', () => {
    expect(main).toContain("&attempt=${encodeURIComponent(crypto.randomUUID())}");
  });

  it('prefers the server-stored avatar in the Identity card', () => {
    expect(main).toContain('const avatarUrl = d.avatarUrl || d.discordAvatarUrl || null;');
    expect(shell).toContain('patch.discordAvatarUrl = s.avatarUrl || s.discordAvatarUrl ||');
  });
});
