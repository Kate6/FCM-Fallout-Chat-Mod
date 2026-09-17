import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';

const repo = path.resolve(import.meta.dirname, '../..');
const workflow = readFileSync(path.join(repo, '.github/workflows/build-windows.yml'), 'utf8');
describe('portable release', () => {
  it('builds portable separately from NSIS with stable portable metadata', () => {
    expect(workflow).toContain('--win nsis --publish never');
    expect(workflow).toContain('--win portable --publish never');
    expect(workflow).not.toContain('--win nsis portable');
    expect(workflow).toContain('-c.extraMetadata.fcmPortable=true');
    expect(workflow).toContain('-c.extraMetadata.fcmChannel=stable');
    expect(workflow).toContain('options: [installer, portable, both]');
  });

  it('packages only a hash-matching PROD bridge, preserves existing outputs and excludes profiles', () => {
    const temp = mkdtempSync(path.join(tmpdir(), 'fcm-portable-release-'));
    const ps = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
    const run = args => spawnSync(ps, ['-NoProfile', ...args], { encoding: 'utf8', timeout: 30000 });
    try {
      const bridge = path.join(temp, 'bridge'); mkdirSync(path.join(bridge, 'Data'), { recursive: true });
      const bytes = Buffer.from('test BA2 fixture');
      writeFileSync(path.join(bridge, 'Data/FCMServerBridge.ba2'), bytes);
      writeFileSync(path.join(bridge, 'BUILD.json'), JSON.stringify({ target: 'prod', ba2Sha256: createHash('sha256').update(bytes).digest('hex') }));
      writeFileSync(path.join(bridge, 'EXPORT.json'), JSON.stringify({ environment: 'prod' }));
      for (const name of ['INSTALL.txt', 'FCMServerBridge.hudmodloader.ini', 'Fallout76Custom.ini.example']) writeFileSync(path.join(bridge, name), 'fixture');
      const zip = path.join(temp, 'bridge.zip');
      const quote = value => `'${value.replaceAll("'", "''")}'`;
      const compress = () => run(['-Command', `Compress-Archive -Path ${quote(bridge + '/*')} -DestinationPath ${quote(zip)} -Force`]);
      expect(compress().status).toBe(0);
      const exe = path.join(temp, 'Fallout Chat Mod Portable 1.4.0.exe');
      writeFileSync(exe, Buffer.alloc(1024 * 1024));
      const args = ['-File', path.join(repo, 'Packaging/package-portable.ps1'), '-Version', '1.4.0', '-PortableExe', exe, '-BridgeZip', zip, '-OutputDir', path.join(temp, 'out')];
      const result = run(args); expect(result.stderr).toBe(''); expect(result.status).toBe(0);
      const folder = path.join(temp, 'out/Fallout Chat Mod Portable 1.4.0');
      expect(existsSync(folder + '.zip')).toBe(true);
      expect(existsSync(path.join(folder, 'README.txt'))).toBe(true);
      expect(existsSync(path.join(folder, 'FCMData'))).toBe(false);
      expect(run(args).status).not.toBe(0);
      writeFileSync(path.join(bridge, 'EXPORT.json'), JSON.stringify({ environment: 'dev' }));
      expect(compress().status).toBe(0);
      const invalid = [...args]; invalid[invalid.length - 1] = path.join(temp, 'rejected');
      expect(run(invalid).status).not.toBe(0);
      expect(existsSync(path.join(temp, 'rejected'))).toBe(false);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }, 60000);
});
