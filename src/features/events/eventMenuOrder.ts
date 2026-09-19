/**
 * Print order for the event menu. `EventDish.sortOrder` is optional, so a
 * line without one keeps the position it already has on screen: its index in
 * the incoming list is its sort key. Today's order therefore never moves
 * until somebody presses Move up or Move down.
 */
export type OrderableMenuLine = {
  readonly sortOrder?: number | null;
};

export function orderEventMenuLines<T extends OrderableMenuLine>(
  lines: readonly T[],
): T[] {
  return lines
    .map((line, index) => ({
      line,
      index,
      key: typeof line.sortOrder === "number" ? line.sortOrder : index,
    }))
    .sort((left, right) => left.key - right.key || left.index - right.index)
    .map((row) => row.line);
}

/**
 * A move swaps two neighbours: each one takes the other's position on the
 * printed list. Returns null when the move would leave the list.
 */
export function planEventMenuLineSwap(
  length: number,
  index: number,
  direction: -1 | 1,
): { readonly from: number; readonly to: number } | null {
  const to = index + direction;
  if (index < 0 || index >= length || to < 0 || to >= length) return null;
  return { from: index, to };
}
