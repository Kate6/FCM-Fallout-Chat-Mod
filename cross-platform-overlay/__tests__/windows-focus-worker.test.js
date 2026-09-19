import { afterEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
const { WindowsFocusWorker, buildFocusScript } = createRequire(import.meta.url)('../windows-focus-worker');
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const children = [], log = vi.fn();
  const spawn = vi.fn(() => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdin.write = vi.fn(); child.stdin.end = vi.fn(); child.kill = vi.fn();
    children.push(child); return child;
  });
  return { worker: new WindowsFocusWorker({ spawn, ownerPid: 123, log }), children, spawn, log };
}
test('prewarms once and handles 100 requests without spawning another process', () => {
  const { worker, children, spawn, log } = fixture(); worker.start();
  const c = children[0]; c.stdout.emit('data', 'REA'); c.stdout.emit('data', 'DY\r\n');
  for (let i = 1; i <= 100; i++) {
    expect(worker.request()).toBe(true);
    expect(c.stdin.write).toHaveBeenLastCalledWith(`${i}:${Date.now()+3000}\n`);
    c.stdout.emit('data', `DONE:${i}:activated:2\n`);
  }
  expect(spawn).toHaveBeenCalledTimes(1); expect(log).toHaveBeenLastCalledWith(expect.stringContaining('nativeMs=2'));
  worker.dispose(); expect(c.kill).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
test('cancellation retires only the owned worker and ignores stale replies/exits', () => {
  const { worker, children } = fixture(); worker.request(); const old = children[0];
  worker.cancel('focus-chat'); expect(old.kill).toHaveBeenCalledOnce(); worker.request();
  old.stdout.emit('data','READY\nDONE:1:activated:1\n'); old.emit('exit',0);
  expect(worker.child).toBe(children[1]); expect(worker.pending.id).toBe(2);
  children[1].stdout.emit('data','READY\nDONE:2:denied:1\n'); expect(worker.pending).toBeNull(); worker.dispose();
});
test('timeout is fail closed with bounded retry, not a restart loop', () => {
  const { worker, children, spawn } = fixture(); worker.request(); vi.advanceTimersByTime(3000);
  expect(children[0].kill).toHaveBeenCalledOnce(); expect(worker.request()).toBe(false);
  vi.advanceTimersByTime(5000); worker.start(); expect(spawn).toHaveBeenCalledTimes(2);
  worker.dispose(); expect(worker.request()).toBe(false); expect(vi.getTimerCount()).toBe(0);
});
test('startup failure, broken pipe and oversized output release worker resources', () => {
  for (const failure of ['startup','pipe','output','exit','error']) {
    const { worker, children } = fixture(); worker.start(); const c=children[0];
    if(failure==='startup') vi.advanceTimersByTime(5000);
    if(failure==='pipe') c.stdin.emit('error',new Error('private'));
    if(failure==='output') c.stdout.emit('data','x'.repeat(4097));
    if(failure==='exit') c.emit('exit',1);
    if(failure==='error') c.emit('error',new Error('private'));
    expect(worker.child).toBeNull(); worker.dispose(); expect(vi.getTimerCount()).toBe(0);
  }
});
test('script checks owner and deadline immediately before activation and sleeps on stdin', () => {
  const ps=buildFocusScript(123);
  expect(ps).toContain('Console.ReadLine()'); expect(ps).toContain('owner!=123');
  expect(ps).toContain('DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()>deadline');
  expect(ps).toContain('SetForegroundWindow(game.MainWindowHandle)?"activated":"denied"');
  expect(() => buildFocusScript('1;bad')).toThrow();
});
