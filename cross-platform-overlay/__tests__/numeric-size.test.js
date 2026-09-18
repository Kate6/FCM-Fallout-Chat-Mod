import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';
import { clampToWorkArea } from '../overlay-core.js';

it('applies validated dimensions through clamping and clears temporary settings geometry', async () => {
  const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  const start = source.indexOf("ipcMain.handle('window:apply-size'");
  const end = source.indexOf('\n// In-app edge resize', start);
  let handler, persisted = 0, pendingBounds;
  let bounds = { x: 20, y: 20, width: 560, height: 720 };
  const context = vm.createContext({
    setTimeout: callback => { bounds = pendingBounds; callback(); },
    ipcMain: { handle: (_name, fn) => { handler = fn; } },
    mainWindow: { isDestroyed: () => false, getBounds: () => bounds },
    clampToWorkArea: desired => clampToWorkArea(desired, { x: 0, y: 0, width: 1920, height: 1080 }),
    setWindowBoundsGuarded: desired => { pendingBounds = desired; }, persistBounds: () => { persisted++; },
    modalFitPrevBounds: bounds, modalFitLastGoodSize: bounds,
  });
  vm.runInContext(source.slice(start, end), context);
  for (const size of [{ width: NaN, height: 400 }, { width: Infinity, height: 400 }, { width: -1, height: 400 }, { width: 400.5, height: 400 }]) expect(await handler({}, size)).toBeNull();
  expect(persisted).toBe(0);
  expect(await handler({}, { width: 420, height: 300 })).toMatchObject({ width: 420, height: 300 });
  expect(context.modalFitPrevBounds).toBeNull();
  expect(context.modalFitLastGoodSize).toBeNull();
  expect(await handler({}, { width: 99999, height: 99999 })).toMatchObject({ width: 1920, height: 1080 });
  expect(persisted).toBe(2);
});
