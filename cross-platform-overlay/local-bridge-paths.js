'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readBoundedFile } = require('./local-bridge-files');
const runFile = promisify(execFile);
const APP_ID = '1151340';

function steamLibraries(text, pathApi = path) {
  const values = [];
  for (const match of (text || '').matchAll(/"path"\s+"((?:\\.|[^"\\])*)"/g)) {
    const value = match[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
    if (pathApi.isAbsolute(value) && !values.includes(value)) values.push(value);
    if (values.length === 16) break;
  }
  return values;
}
function installDirectory(text) {
  if (!new RegExp(`"appid"\\s+"${APP_ID}"`).test(text || '')) return null;
  const name = /"installdir"\s+"([^"\\/]+)"/.exec(text || '')?.[1];
  return name && name !== '.' && name !== '..' && !/[\x00-\x1f:]/.test(name) ? name : null;
}

/** Only process executable/cwd metadata and fixed Steam library manifests are
 * queried. No memory, game content, recursive search, listeners or port scans. */
async function discoverBridgePaths({ environment, platform = process.platform, env = process.env,
  home = os.homedir(), documents, io = fs.promises, run = runFile, read = readBoundedFile } = {}) {
  if (!['dev', 'prod'].includes(environment) || !['win32', 'linux'].includes(platform)) return [];
  const p = platform === 'win32' ? path.win32 : path.posix;
  const roots = new Set(), activeRoots = new Set(), libraries = new Set(), fallbacks = new Set();
  const canonical = async value => {
    try { const real = await io.realpath(value); return (await io.stat(real)).isDirectory() ? real : null; }
    catch { return null; }
  };
  const addDirectory = async (set, value) => {
    if (typeof value !== 'string' || !p.isAbsolute(value)) return;
    const real = await canonical(value); if (real) set.add(real);
  };
  const addExecutable = async value => {
    if (typeof value !== 'string' || !p.isAbsolute(value) || p.basename(value).toLowerCase() !== 'fallout76.exe') return;
    try { if (!(await io.stat(value)).isFile()) return; } catch { return; }
    await addDirectory(activeRoots, p.dirname(value));
  };
  if (platform === 'win32') {
    // All PowerShell text is static; no discovered path is interpolated into it.
    try {
      const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "$ErrorActionPreference='Stop'; $paths=@(Get-CimInstance Win32_Process -Filter \"Name='Fallout76.exe'\" | Select-Object -ExpandProperty ExecutablePath); $steam=(Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Valve\\Steam' -ErrorAction SilentlyContinue).SteamPath; @{paths=$paths;steam=$steam} | ConvertTo-Json -Compress"],
      { windowsHide: true, timeout: 4000, maxBuffer: 16384 });
      const info = JSON.parse(stdout);
      for (const exe of (Array.isArray(info.paths) ? info.paths : []).slice(0, 8)) await addExecutable(exe);
      await addDirectory(libraries, info.steam);
    } catch { /* Fixed default roots still allow Steam startup ordering. */ }
    for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles]) {
      if (base) await addDirectory(libraries, p.join(base, 'Steam'));
    }
    if (documents) await addDirectory(fallbacks, p.join(documents, 'My Games', 'Fallout 76'));
    if (env.LOCALAPPDATA) await addDirectory(fallbacks, env.LOCALAPPDATA);
  } else {
    for (const rel of ['.local/share/Steam', '.steam/steam', '.steam/root', '.var/app/com.valvesoftware.Steam/.local/share/Steam']) {
      await addDirectory(libraries, p.join(home, rel));
    }
    try {
      const { stdout } = await run('pgrep', ['-x', 'Fallout76.exe'], { timeout: 4000, maxBuffer: 4096 });
      for (const pid of stdout.trim().split(/\s+/).filter(id => /^\d+$/.test(id)).slice(0, 8)) {
        try { await addExecutable(await io.readlink(`/proc/${pid}/exe`)); } catch { /* Wine executable may be its loader. */ }
        try {
          const cwd = await io.readlink(`/proc/${pid}/cwd`);
          await addExecutable(p.join(cwd, 'Fallout76.exe'));
        } catch { /* The process can exit during discovery. */ }
      }
    } catch { /* The separately checked game presence remains authoritative. */ }
  }
  // Read only Steam's fixed library index, then the one FO76 app manifest.
  for (const library of [...libraries]) {
    const text = await read(library, p.join('steamapps', 'libraryfolders.vdf'), 65536, io);
    for (const other of steamLibraries(text, p)) await addDirectory(libraries, other);
  }
  for (const library of [...libraries].slice(0, 16)) {
    const text = await read(library, p.join('steamapps', `appmanifest_${APP_ID}.acf`), 65536, io);
    const name = installDirectory(text);
    if (!name) continue;
    const root = await canonical(p.join(library, 'steamapps', 'common', name));
    if (!root) continue;
    roots.add(root);
    if (platform === 'linux' && (!activeRoots.size || activeRoots.has(root))) {
      const user = p.join(library, 'steamapps', 'compatdata', APP_ID, 'pfx', 'drive_c', 'users', 'steamuser');
      // Proton's Documents may itself be a link; canonicalize the known fallback
      // root, then prohibit links within its provider-owned export path.
      for (const rel of ['Documents/My Games/Fallout 76', 'My Documents/My Games/Fallout 76', 'AppData/Local']) {
        await addDirectory(fallbacks, p.join(user, rel));
      }
    }
  }
  const candidates = [];
  for (const root of activeRoots.size ? activeRoots : roots) {
    candidates.push({ root, relative: p.join('Data', 'modsdata', `fcmserverbridge-${environment}.json`), provider: 'xscal' });
    candidates.push({ root, relative: p.join('Data', 'ZFE', 'Storage', 'FCMServerBridge', `${environment}-state.json`), provider: 'zfe' });
  }
  for (const root of fallbacks) {
    candidates.push({ root, relative: p.join('ZFE', 'Storage', 'FCMServerBridge', `${environment}-state.json`), provider: 'zfe' });
  }
  return candidates.filter((c, index) => candidates.findIndex(other => p.join(other.root, other.relative) === p.join(c.root, c.relative)) === index);
}

module.exports = { steamLibraries, installDirectory, discoverBridgePaths };
