import { expect, test, vi } from 'vitest';
import { createRequire } from 'node:module';
const { startLocalPerformance } = createRequire(import.meta.url)('../local-performance');
test('opt-in capture is bounded, redacted and tears down', () => {
  let tick; const log=vi.fn(), clearTimer=vi.fn();
  const lag={enable:vi.fn(),disable:vi.fn(),reset:vi.fn(),percentile:()=>21000000,max:27000000};
  const stop=startLocalPerformance({enabled:true, metrics:()=>[{type:'Tab',pid:123,name:'secret',cpu:{percentCPUUsage:1.234},memory:{workingSetSize:200}}],log,
    histogram:()=>lag,setTimer:fn=>{tick=fn;return 1;},clearTimer});
  stop.observeBridge({durationMs:12,candidates:2});
  for(let i=0;i<40;i++)tick();
  expect(log.mock.calls[0][0]).toContain('"maxMs":12');
  expect(log.mock.calls[1][0]).toContain('"passes":0');
  expect(log).toHaveBeenCalledTimes(40); expect(log.mock.calls[0][0]).toContain('"cpuPercent":1.23');
  expect(log.mock.calls[0][0]).not.toMatch(/secret|pid/); expect(clearTimer).toHaveBeenCalledOnce();
  stop(); expect(lag.disable).toHaveBeenCalledOnce();
});
test('disabled diagnostics create no timer or metrics reads',()=>{
  const metrics=vi.fn(), histogram=vi.fn(),setTimer=vi.fn();
  startLocalPerformance({enabled:false,metrics,histogram,setTimer})();
  expect(histogram).not.toHaveBeenCalled();expect(setTimer).not.toHaveBeenCalled();
});
