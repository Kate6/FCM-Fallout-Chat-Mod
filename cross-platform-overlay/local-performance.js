'use strict';
const { monitorEventLoopDelay } = require('node:perf_hooks');

// Explicit, local-only ten-minute capture; no identities, messages or remote upload.
function startLocalPerformance({ enabled, metrics, log, histogram = monitorEventLoopDelay,
  setTimer = setInterval, clearTimer = clearInterval }) {
  if (!enabled) return () => {};
  const lag = histogram({ resolution: 20 }); lag.enable();
  let samples = 0, stopped = false;
  let bridge = { passes: 0, totalMs: 0, maxMs: 0, maxCandidates: 0 };
  const stop = () => { if (stopped) return; stopped = true; clearTimer(timer); lag.disable(); };
  const timer = setTimer(() => {
    try {
      const rows = metrics().slice(0, 32).map(m => ({
        type: ['Browser','Tab','GPU','Utility'].includes(m.type) ? m.type : 'Other',
        cpuPercent: Number.isFinite(m.cpu?.percentCPUUsage) ? Math.round(m.cpu.percentCPUUsage * 100) / 100 : null,
        workingSetKB: Number.isFinite(m.memory?.workingSetSize) ? m.memory.workingSetSize : null,
      }));
      log('[local-perf] ' + JSON.stringify({ samples: ++samples, processes: rows, bridge,
        eventLoopP95Ms: Math.round(lag.percentile(95) / 1e6), eventLoopMaxMs: Math.round(lag.max / 1e6) }));
      lag.reset();
      bridge = { passes: 0, totalMs: 0, maxMs: 0, maxCandidates: 0 };
    } catch { samples++; }
    if (samples >= 40) stop();
  }, 15000);
  stop.observeBridge = ({ durationMs, candidates }) => {
    if (stopped || !Number.isFinite(durationMs) || durationMs < 0 || !Number.isInteger(candidates) || candidates < 0 || candidates > 64) return;
    bridge.passes++; bridge.totalMs += durationMs;
    bridge.maxMs = Math.max(bridge.maxMs, durationMs); bridge.maxCandidates = Math.max(bridge.maxCandidates, candidates);
  };
  timer.unref?.(); return stop;
}
module.exports = { startLocalPerformance };
