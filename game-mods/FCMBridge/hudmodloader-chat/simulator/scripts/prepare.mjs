import { access, copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const simulator = resolve(here, '..');
const widget = resolve(simulator, '..');
const publicDir = resolve(simulator, 'public');
const run = promisify(execFile);
const source = await readFile(resolve(widget, 'FCMChatWidget.hx'), 'utf8');
const mockSource = await readFile(resolve(simulator, 'haxe/MockXscal.hx'), 'utf8');
const installedFixturePath = resolve(simulator, 'fixtures/installed-xscal-0.2.16.json');
const installedFixture = JSON.parse(await readFile(installedFixturePath, 'utf8'));
for (const method of [...installedFixture.chatMethods, ...installedFixture.inputCallbacks]) {
  if (!mockSource.includes(`"${method}"`)) throw new Error(`MockXscal is missing installed 0.2.16 method ${method}`);
}
const match = source.match(/VERSION:String\s*=\s*"([^"]+)"/);
if (!match) throw new Error('FCMChatWidget version marker not found');
const swf = await readFile(resolve(widget, 'FCMChatWidget.swf'));
if (swf.subarray(0, 3).toString('ascii') !== 'FWS' || swf[3] !== 32) {
  throw new Error('Simulator requires the normalized production FWS v32 artifact');
}
await mkdir(publicDir, { recursive: true });
const ruffleSource = resolve(simulator, 'node_modules/@ruffle-rs/ruffle');
const rufflePublic = resolve(publicDir, 'ruffle');
await mkdir(rufflePublic, { recursive: true });
for (const name of await readdir(ruffleSource)) {
  if (name === 'ruffle.js' || name.endsWith('.wasm') || /^core\.ruffle\..+\.js$/.test(name)) {
    await copyFile(resolve(ruffleSource, name), resolve(rufflePublic, name));
  }
}
await copyFile(resolve(widget, 'FCMChatWidget.swf'), resolve(publicDir, 'FCMChatWidget.swf'));
// Use the locally installed game's own font library when it is available. Nothing from the game
// is checked into or distributed with FCM; the generated public file is ignored and ephemeral.
const gameDataCandidates = [
  process.env.FCM_FALLOUT76_DATA,
  '/mnt/ExtraStorage/SteamLibrary/steamapps/common/Fallout76/Data',
].filter(Boolean);
let gameFontSource = false;
for (const dataDir of gameDataCandidates) {
  const archive = resolve(dataDir, 'SeventySix - Interface.ba2');
  try {
    await access(archive);
    await run('python3', [resolve(widget, '../hudmenu-chat/ba2tool.py'), 'extract', archive,
      'programs/fonts_programs.swf', resolve(publicDir, 'fonts_programs.swf')]);
    gameFontSource = true;
    break;
  } catch { /* The simulator remains usable with Ruffle's fallback font. */ }
}
const productionConfig = await readFile(resolve(widget, 'FCMChat.ini'), 'utf8');
if (!productionConfig.includes('autoHideEnabled=true')) {
  throw new Error('Production FCMChat.ini no longer contains the expected auto-hide setting');
}
// The game defaults to hiding an inactive HUD after 60 seconds. In the laboratory that
// looks exactly like a crashed/blank Ruffle movie, so keep only the generated simulator
// copy visible. The production config and packaged widget behavior remain unchanged.
await writeFile(resolve(publicDir, 'FCMChat.ini'), productionConfig.replace(
  'autoHideEnabled=true',
  '; Simulator-only: keep the preview observable during long test runs.\nautoHideEnabled=false',
));
await copyFile(installedFixturePath, resolve(publicDir, 'installed-xscal-0.2.16.json'));
await writeFile(resolve(publicDir, 'sim-manifest.json'), JSON.stringify({
  kind: 'fcm-hud-simulator',
  warning: 'SIMULATED HOST — NOT FALLOUT 76 OR A NATIVE PROVIDER',
  widgetVersion: match[1],
  swfSha256: createHash('sha256').update(swf).digest('hex'),
  gameFontSource,
}, null, 2) + '\n');
