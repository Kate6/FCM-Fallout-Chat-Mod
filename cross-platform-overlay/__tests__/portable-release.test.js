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

  it('packages the portable overlay with only the validated optional bridge', () => {
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
      const bridgeZip = path.join(temp, 'bridge.zip');
      const quotedBridge = `'${bridge.replaceAll("'", "''")}/*'`;
      const quotedZip = `'${bridgeZip.replaceAll("'", "''")}'`;
      expect(run(['-Command', `Compress-Archive -Path ${quotedBridge} -DestinationPath ${quotedZip} -Force`]).status).toBe(0);
      const exe = path.join(temp, 'Fallout Chat Mod Portable 1.4.0.exe');
      writeFileSync(exe, Buffer.alloc(1024 * 1024));
      const instructions = path.join(temp, 'INSTALL.txt'); writeFileSync(instructions, 'ZFE INSTALL\nXSCAL INSTALL\n');
      const args = ['-File', path.join(repo, 'Packaging/package-portable.ps1'), '-Version', '1.4.0', '-PortableExe', exe, '-BridgeZip', bridgeZip, '-BridgeInstructions', instructions, '-OutputDir', path.join(temp, 'out')];
      const result = run(args); expect(result.stderr).toBe(''); expect(result.status).toBe(0);
      const folder = path.join(temp, 'out/Fallout Chat Mod Portable 1.4.0');
      expect(existsSync(folder + '.zip')).toBe(true);
      expect(existsSync(path.join(folder, 'README.txt'))).toBe(true);
      expect(existsSync(path.join(folder, 'FCMData'))).toBe(false);
      expect(existsSync(path.join(folder, 'Optional FCM Bridge/INSTALL.txt'))).toBe(true);
      expect(readFileSync(path.join(folder, 'Optional FCM Bridge/INSTALL.txt'), 'utf8')).toContain('XSCAL INSTALL');
      expect(run(args).status).not.toBe(0);
    } finally { rmSync(temp, { recursive: true, force: true }); }
  }, 60000);
});
