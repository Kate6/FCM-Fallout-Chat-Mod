import { expect, it } from 'vitest';
import { cpuDeltas, summarizeCpu } from '../scripts/profile-metrics.mjs';
const sample = (time, cpu, pid = 1) => ({ time, processes: [{ pid, type: 'Tab', cpu: { cumulativeCPUUsage: cpu } }] });
it('reports one logical core as 100%, independent of machine CPU count', () => {
  expect(cpuDeltas(sample(1000, 2), sample(3000, 4))).toEqual([{ type: 'Tab', cpu: 100 }]);
});
it('does not turn missing counters, restarted processes or invalid intervals into zero', () => {
  for (const next of [sample(2000, undefined), sample(2000, 1), sample(1000, 3), sample(2000, 3, 2)]) {
    expect(cpuDeltas(sample(1000, 2), next)[0].cpu).toBeNull();
  }
});
it('sums all same-type processes and reports aggregate CPU', () => {
  const result = summarizeCpu([[{ type: 'Tab', cpu: 20 }, { type: 'Tab', cpu: 30 }, { type: 'GPU', cpu: 10 }]]);
  expect(result.Tab.average).toBe(50); expect(result.Aggregate.average).toBe(60);
});
it('missing process measurements invalidate aggregates', () => {
  const result = summarizeCpu([[{ type: 'Tab', cpu: null }, { type: 'Tab', cpu: 20 }]]);
  expect(result.Aggregate).toEqual({ valid: false }); expect(result.Tab).toEqual({ valid: false });
});
