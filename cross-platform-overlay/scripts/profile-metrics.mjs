// Cumulative CPU seconds avoid Electron's platform-dependent normalized percent.
// 100% here always means one fully occupied logical CPU.
export function cpuDeltas(previous, current) {
  const seconds = (current.time - previous.time) / 1000;
  return current.processes.map(process => {
    const old = previous.processes.find(p => p.pid === process.pid && p.type === process.type);
    const total = process.cpu.cumulativeCPUUsage;
    const last = old?.cpu.cumulativeCPUUsage;
    const valid = seconds > 0 && Number.isFinite(total) && Number.isFinite(last) && total >= last;
    return { type: process.type, cpu: valid ? (total - last) / seconds * 100 : null };
  });
}

export function summarizeCpu(samples) {
  const groups = new Map();
  for (const sample of samples) {
    const sums = new Map();
    for (const process of sample) {
      const prior = sums.has(process.type) ? sums.get(process.type) : 0;
      sums.set(process.type, process.cpu === null || prior === null ? null : prior + process.cpu);
    }
    sums.set('Aggregate', sample.some(p => p.cpu === null) ? null : sample.reduce((sum, p) => sum + p.cpu, 0));
    for (const [type, value] of sums) {
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push(value);
    }
  }
  return Object.fromEntries([...groups].map(([type, values]) => [type, values.some(v => v === null)
    ? { valid: false } : { valid: true, average: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values), max: Math.max(...values) }]));
}
