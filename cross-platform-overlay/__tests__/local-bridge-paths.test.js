import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import discovery from '../local-bridge-paths.js';

const manifest = '"AppState" { "appid" "1151340" "installdir" "Fallout76" }';
describe('fixed Steam/provider path discovery', () => {
  it('parses bounded library roots and rejects malformed/traversing app manifests', () => {
    expect(discovery.steamLibraries('"path" "D:\\\\SteamLibrary"', path.win32)).toEqual(['D:\\SteamLibrary']);
    expect(discovery.steamLibraries('"path" "relative" "path" "/games"')).toEqual(['/games']);
    expect(discovery.installDirectory(manifest)).toBe('Fallout76');
    expect(discovery.installDirectory(manifest.replace('Fallout76', '..'))).toBeNull();
    expect(discovery.installDirectory(manifest.replace('Fallout76', '../Other'))).toBeNull();
    expect(discovery.installDirectory(manifest.replace('1151340', 'other'))).toBeNull();
  });
  it('discovers a custom Linux Steam library and its exact Proton fallbacks without scanning', async () => {
    // Model POSIX paths even when this suite runs on native Windows. Actual file
    // validation is exercised on the host filesystem in local-bridge-files.test.
    const home = '/fixture/home', steam = `${home}/.local/share/Steam`, library = `${home}/custom-library`;
    const game = `${library}/steamapps/common/Fallout76`;
    const user = `${library}/steamapps/compatdata/1151340/pfx/drive_c/users/steamuser`;
    const dirs = new Set([steam, library, game, `${user}/Documents/My Games/Fallout 76`, `${user}/AppData/Local`]);
    const io = { realpath: vi.fn(async p => { if (!dirs.has(p)) throw new Error('missing'); return p; }),
      stat: vi.fn(async p => ({ isDirectory: () => dirs.has(p), isFile: () => false })) };
    const read = vi.fn(async (root, rel) => root === steam && rel === 'steamapps/libraryfolders.vdf'
      ? `"path" "${library}"` : root === library && rel === 'steamapps/appmanifest_1151340.acf' ? manifest : null);
    const run = vi.fn().mockRejectedValue(new Error('No process yet'));
    const result = await discovery.discoverBridgePaths({ environment: 'dev', platform: 'linux', home, env: {}, run, io, read });
    expect(result).toEqual(expect.arrayContaining([
      { root: game, relative: 'Data/modsdata/fcmserverbridge-dev.json', provider: 'xscal' },
      { root: game, relative: 'Data/ZFE/Storage/FCMServerBridge/dev-state.json', provider: 'zfe' },
      { root: `${user}/Documents/My Games/Fallout 76`, relative: 'ZFE/Storage/FCMServerBridge/dev-state.json', provider: 'zfe' },
      { root: `${user}/AppData/Local`, relative: 'ZFE/Storage/FCMServerBridge/dev-state.json', provider: 'zfe' },
    ]));
    expect(run).toHaveBeenCalledWith('pgrep', ['-x', 'Fallout76.exe'], expect.any(Object));
  });
  it('prefers the exact active Windows executable over other installed Steam libraries', async () => {
    const dirs = new Set(['C:\\Steam', 'D:\\Steam', 'D:\\Steam\\steamapps\\common\\Fallout76', 'E:\\Active', 'C:\\Docs\\My Games\\Fallout 76', 'C:\\Local']);
    const io = { realpath: vi.fn(async p => { if (!dirs.has(p)) throw new Error('missing'); return p; }),
      stat: vi.fn(async p => ({ isDirectory: () => dirs.has(p), isFile: () => p === 'E:\\Active\\Fallout76.exe' })) };
    const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ paths: ['E:\\Active\\Fallout76.exe'], steam: 'C:\\Steam' }) });
    const read = vi.fn(async (_root, rel) => rel.endsWith('libraryfolders.vdf') ? '"path" "D:\\\\Steam"' : manifest);
    const result = await discovery.discoverBridgePaths({ environment: 'prod', platform: 'win32', env: { LOCALAPPDATA: 'C:\\Local' }, documents: 'C:\\Docs', io, run, read });
    expect(result.filter(c => c.provider === 'xscal')).toEqual([{ root: 'E:\\Active', relative: 'Data\\modsdata\\fcmserverbridge-prod.json', provider: 'xscal' }]);
    expect(result.some(c => c.root === 'C:\\Docs\\My Games\\Fallout 76')).toBe(true);
    expect(result.some(c => c.root === 'C:\\Local')).toBe(true);
    expect(run.mock.calls[0][1].at(-1)).not.toContain('E:\\Active'); // Static command, never interpolated.
    expect(io.realpath.mock.calls.every(([p]) => !p.includes('**'))).toBe(true);
  });
  it('rejects unknown environments/platforms without any filesystem or process work', async () => {
    const run = vi.fn(), io = { realpath: vi.fn() };
    expect(await discovery.discoverBridgePaths({ environment: 'qa', platform: 'linux', run, io })).toEqual([]);
    expect(await discovery.discoverBridgePaths({ environment: 'dev', platform: 'darwin', run, io })).toEqual([]);
    expect(run).not.toHaveBeenCalled(); expect(io.realpath).not.toHaveBeenCalled();
  });
});
