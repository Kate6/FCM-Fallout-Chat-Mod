#!/usr/bin/env node
// Experimental, fully-contained portable build. Deliberately targets hosted DEV
// and never publishes. Linux builds AppImage; Windows builds only portable.exe.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const version = process.env.FCM_BUILD_VERSION || `${pkg.version.split('-')[0]}-portable.${stamp}`;
const env = { ...process.env, BUILD_CHANNEL: 'qa', FCM_BUILD_VERSION: version };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const eb = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const common = [
  '-c.extraMetadata.fcmChannel=qa',
  '-c.extraMetadata.fcmPortable=true',
  '-c.extraMetadata.fcmExperimental=true',
  `-c.extraMetadata.version=${version}`,
  '-c.productName=Fallout Chat Mod Portable Experimental',
  '--publish', 'never',
];

console.log(`[dist:portable:experimental] ${version} -> dev.falloutchatmod.com`);
execFileSync(npm, ['run', 'build:renderer'], { cwd: root, env, stdio: 'inherit' });
if (process.platform === 'win32') {
  execFileSync(eb, ['--win', 'portable', ...common], { cwd: root, env, stdio: 'inherit' });
} else if (process.platform === 'linux') {
  execFileSync(eb, ['--linux', 'AppImage', ...common], { cwd: root, env, stdio: 'inherit' });
} else {
  throw new Error('Experimental portable build currently supports Windows and Linux only');
}
console.log('[dist:portable:experimental] complete; artifact is experimental and must not be published');
