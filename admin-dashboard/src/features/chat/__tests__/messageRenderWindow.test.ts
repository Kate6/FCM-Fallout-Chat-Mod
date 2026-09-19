import { expect, it } from 'vitest';
import { messageWindowStart, previousMessagePage } from '../messageRenderWindow';
const rows = Array.from({ length: 1500 }, (_, id) => ({ id: String(id) }));
it('renders only the newest 100 without discarding history', () => {
  expect(messageWindowStart(rows, null)).toBe(1400);
  expect(messageWindowStart([], null)).toBe(0);
  expect(messageWindowStart(rows.slice(0, 20), null)).toBe(0);
  expect(rows).toHaveLength(1500);
});
it('reveals cached history in hundred-row pages down to the oldest row', () => {
  let start = messageWindowStart(rows, null);
  for (let page = 1; page <= 14; page++) {
    start = messageWindowStart(rows, previousMessagePage(rows, start));
    expect(start).toBe(1400 - page * 100);
  }
});
it('anchors reading across live append, prepend and removed rows', () => {
  const first = previousMessagePage(rows, 1400);
  expect(messageWindowStart([...rows, { id: 'new' }], first)).toBe(1300);
  expect(messageWindowStart([{ id: 'older' }, ...rows], first)).toBe(1301);
  expect(messageWindowStart(rows.filter(row => row.id !== first), first)).toBe(0);
});
it('explicit all mode reveals remote prepends and mention targets', () => {
  expect(messageWindowStart(rows, '1400', true)).toBe(0);
  expect(messageWindowStart([{ id: 'older' }, ...rows], '1400', true)).toBe(0);
});
