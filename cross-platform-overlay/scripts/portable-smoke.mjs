#!/usr/bin/env node
// PID-scoped smoke test for an experimental portable Linux artifact. Safe while
// the production overlay is running: cleanup targets only the spawned process group.
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const bin = path.resolve(process.argv[2] || '');
const preserve = process.argv.includes('--preserve');
if (!bin || !existsSync(bin)) throw new Error(`portable executable not found: ${bin}`);
const portableRoot = path.dirname(bin);
const dataRoot = path.join(portableRoot, 'FCMData');
const logPath = path.join(dataRoot, 'logs', 'main.log');
const isolated = mkdtempSync(path.join(os.tmpdir(), 'fcm-portable-smoke-'));
const env = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(isolated, 'xdg-config'),
  XDG_CACHE_HOME: path.join(isolated, 'xdg-cache'),
  XDG_CURRENT_DESKTOP: '',
  XDG_SESSION_DESKTOP: '',
  XDG_SESSION_TYPE: 'x11',
  APPIMAGELAUNCHER_DISABLE: '1',
  ELECTRON_DISABLE_SANDBOX: '1',
};
for (const key of ['ELECTRON_RUN_AS_NODE', 'WAYLAND_DISPLAY', 'RENDERER_URL']) delete env[key];

if (!preserve) rmSync(dataRoot, { recursive: true, force: true });
const child = spawn('xvfb-run', [
  '-a', bin, '--appimage-extract-and-run', '--no-sandbox', '--disable-gpu',
  '--disable-dev-shm-usage', '--ozone-platform=x11',
], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

await new Promise(resolve => setTimeout(resolve, 10_000));
try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
await new Promise(resolve => setTimeout(resolve, 500));
try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ }

let log = '';
try { log = readFileSync(logPath, 'utf8'); } catch { /* verdict below */ }
const combined = output + log;
const ordinaryConfig = path.join(env.XDG_CONFIG_HOME, 'Fallout Chat Mod');
const failures = [];
if (!existsSync(logPath)) failures.push(`portable log missing: ${logPath}`);
if (!combined.includes('=== Fallout Chat Mod overlay starting ===')) failures.push('startup marker missing');
if (!combined.includes('[portable] root=' + portableRoot)) failures.push('portable-root marker missing');
if (/Cannot find module|\[uncaught\]/.test(combined)) failures.push('fatal startup pattern found');
if (existsSync(ordinaryConfig) && readdirSync(ordinaryConfig).length) failures.push(`ordinary profile was written: ${ordinaryConfig}`);

console.log(JSON.stringify({
  ok: failures.length === 0,
  portableRoot,
  dataRoot,
  logPath,
  containedEntries: existsSync(dataRoot) ? readdirSync(dataRoot).sort() : [],
  ordinaryProfileWritten: existsSync(ordinaryConfig),
  failures,
}, null, 2));
rmSync(isolated, { recursive: true, force: true });
if (failures.length) process.exit(1);
