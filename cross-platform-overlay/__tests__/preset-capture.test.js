import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
it('captures small and large chat presets repeatedly without changing live resize bounds', () => {
  let capture;
  const live = { x: -1500, y: 100, width: 560, height: 720 };
  const context = {
    ipcMain: { handle: (_name, handler) => { capture = handler; } },
    mainWindow: { isDestroyed: () => false, getBounds: () => live },
    modalFitPrevBounds: { width: 400, height: 300 },
    collapsed: false, expandedHeight: 500,
  };
  const start = source.indexOf("ipcMain.handle('window:get-bounds'");
  vm.runInNewContext(source.slice(start, source.indexOf("ipcMain.on('window:set-bounds'", start)), context);
  for (let i = 0; i < 20; i++) {
    expect(capture({}, true)).toEqual({ ...live, width: 400, height: 300 });
    expect(capture({})).toEqual(live);
  }
  context.modalFitPrevBounds = null;
  live.width = 900; live.height = 800;
  expect(capture({}, true)).toEqual(live);
  context.collapsed = true;
  expect(capture({}, true).height).toBe(500);
  expect(capture({}).height).toBe(800);
});
