import type { TppRow, TppTotal } from "./types";

export function sumRows(rows: readonly TppRow[], key: string): number {
  return rows.reduce((sum, row) => {
    const value = row.values[key];
    return (
      sum + (typeof value === "number" && Number.isFinite(value) ? value : 0)
    );
  }, 0);
}

/** Null when there is nothing to divide by, so the report never shows a made-up 0%. */
export function percentage(
  numerator: number,
  denominator: number,
): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

export function groupTotals(
  rows: readonly TppRow[],
  definitions: readonly Omit<TppTotal, "value">[],
): TppTotal[] {
  return definitions.map((definition) => ({
    ...definition,
    value: sumRows(rows, definition.key),
  }));
}

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export function agingBucket(dueAt: number, asOf: number): AgingBucket {
  const days = Math.floor((asOf - dueAt) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}
