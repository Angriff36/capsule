/**
 * Return count of a pack line after the event: what came back, what was used
 * up, what was lost and what came back broken. Pure.
 */

export type PackReturnLine = {
  packedQuantity: number;
  loadedQuantity?: number | null;
  returnedQuantity?: number | null;
  usedQuantity?: number | null;
  lostQuantity?: number | null;
  damagedQuantity?: number | null;
  returnCountedAt?: number | null;
};

const n = (value: number | null | undefined) => Number(value ?? 0) || 0;

const show = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

/**
 * What left the building on this line: the on-truck count when one was
 * taken, else what was packed.
 */
export function packWentOut(line: {
  packedQuantity?: number | null;
  loadedQuantity?: number | null;
}): number {
  return n(line.loadedQuantity) > 0
    ? n(line.loadedQuantity)
    : n(line.packedQuantity);
}

/** Amount that went out and no return count accounts for yet. Never below zero. */
export function packReturnOutstanding(line: PackReturnLine): number {
  const counted =
    n(line.returnedQuantity) +
    n(line.usedQuantity) +
    n(line.lostQuantity) +
    n(line.damagedQuantity);
  return Math.max(0, packWentOut(line) - counted);
}

/** "Back 8 · used 1 · lost 1" - zero amounts after "back" are left out. */
export function packReturnSummary(line: PackReturnLine): string {
  const parts = [`Back ${show(n(line.returnedQuantity))}`];
  if (n(line.usedQuantity) > 0)
    parts.push(`used ${show(n(line.usedQuantity))}`);
  if (n(line.lostQuantity) > 0)
    parts.push(`lost ${show(n(line.lostQuantity))}`);
  if (n(line.damagedQuantity) > 0)
    parts.push(`broken ${show(n(line.damagedQuantity))}`);
  const open = packReturnOutstanding(line);
  if (open > 0) parts.push(`${show(open)} not counted`);
  return parts.join(" · ");
}

export type PackReturnTotals = {
  /** Lines that went out and have to come back. */
  lines: number;
  counted: number;
  lost: number;
  damaged: number;
  /** Lines with packed amount no count accounts for. */
  open: number;
};

export function packReturnTotals(
  lines: readonly PackReturnLine[],
): PackReturnTotals {
  const out = lines.filter((line) => n(line.packedQuantity) > 0);
  return {
    lines: out.length,
    counted: out.filter((line) => line.returnCountedAt != null).length,
    lost: out.reduce((sum, line) => sum + n(line.lostQuantity), 0),
    damaged: out.reduce((sum, line) => sum + n(line.damagedQuantity), 0),
    open: out.filter(
      (line) => line.returnCountedAt == null || packReturnOutstanding(line) > 0,
    ).length,
  };
}
