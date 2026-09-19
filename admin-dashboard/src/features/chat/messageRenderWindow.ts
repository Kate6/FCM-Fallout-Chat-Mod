export const MESSAGE_RENDER_PAGE = 100;

/** An ID anchor, not a tail count, keeps live appends from evicting a reader's row. */
export function messageWindowStart(rows: readonly { id: string }[], firstId: string | null, all = false): number {
  if (all) return 0;
  if (firstId !== null) {
    const index = rows.findIndex(row => row.id === firstId);
    if (index >= 0) return index;
    // A removed anchor must not silently discard the reader's surrounding history.
    return 0;
  }
  return Math.max(0, rows.length - MESSAGE_RENDER_PAGE);
}

export function previousMessagePage(rows: readonly { id: string }[], start: number): string | null {
  return rows[Math.max(0, start - MESSAGE_RENDER_PAGE)]?.id ?? null;
}
