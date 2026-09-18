import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';

const source = readFileSync(new URL('../main.js', import.meta.url), 'utf8');

describe('renderer/native collapse reconciliation', () => {
  it('reveals the renderer before every input-focus request, even when native collapse is false', () => {
    const events = [];
    const body = source.slice(source.indexOf('function dispatchFocusInput('), source.indexOf('\nfunction focusToChat('));
    const context = vm.createContext({ diag() {}, sendToRenderer: (...args) => events.push(args) });
    vm.runInContext(body, context);
    for (let i = 0; i < 20; i++) {
      events.length = 0;
      vm.runInContext("dispatchFocusInput('test')", context);
      expect(events).toEqual([['overlay:force-expand', true], ['overlay:focus-input', true]]);
    }
  });

  it.each([false, true])('honors portable in-game collapse without forcing a wake (full hide=%s)', (fullAutoHide) => {
    const events = [];
    let handler;
    const start = source.indexOf("ipcMain.on('overlay:collapse'");
    const end = source.indexOf("ipcMain.on('overlay:expand'", start);
    vm.runInNewContext(source.slice(start, end), {
      ipcMain: { on: (_name, callback) => { handler = callback; } },
      overlayCore: { shouldSuppressIdleCollapse: () => true },
      IS_PORTABLE: true, gameRunning: true, diag() {},
      sendToRenderer: (...args) => events.push(args),
      collapseToHeader: (...args) => events.push(['collapse', ...args]),
    });
    for (let i = 0; i < 20; i++) {
      events.length = 0;
      handler({}, { headerHeight: 40, fullAutoHide });
      expect(events).toEqual([['collapse', 40, fullAutoHide]]);
    }
  });
});
