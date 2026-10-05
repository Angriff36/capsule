// Bin sheet (Mangia "Memo - Perfect Packing", 8-26-22): every pack list line
// carries the number of the black bin it went in; each bin lid gets a colour
// sticker that says where the bin goes onsite. On the way back, bins with
// dirty dishes are circled so they go straight to the dish room.

export type BinColor = "green" | "red" | "yellow" | "blue";

export const BIN_COLORS: ReadonlyArray<{
  value: BinColor;
  label: string;
  place: string;
}> = [
  { value: "green", label: "Green", place: "Buffet area" },
  { value: "red", label: "Red", place: "Kitchen" },
  {
    value: "yellow",
    label: "Yellow",
    place: "Buffet item that starts in the kitchen",
  },
  { value: "blue", label: "Blue", place: "Other equipment" },
];

export interface BinMark {
  bin: number;
  color: BinColor | null;
  dirty: boolean;
}

const isColor = (value: unknown): value is BinColor =>
  BIN_COLORS.some((color) => color.value === value);

/** Read the stored sheet. Anything unreadable is left out, never thrown. */
export function parseBinSheet(raw: string | null | undefined): BinMark[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const marks = new Map<number, BinMark>();
  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const bin = Number(row.bin);
    if (!Number.isInteger(bin) || bin <= 0) continue;
    marks.set(bin, {
      bin,
      color: isColor(row.color) ? row.color : null,
      dirty: row.dirty === true,
    });
  }
  return [...marks.values()].sort((a, b) => a.bin - b.bin);
}

/** Store only bins that say something (a colour or a dirty mark). */
export function serializeBinSheet(marks: BinMark[]): string {
  const kept = marks
    .filter((mark) => mark.color != null || mark.dirty)
    .sort((a, b) => a.bin - b.bin)
    .map((mark) => ({ bin: mark.bin, color: mark.color, dirty: mark.dirty }));
  return kept.length === 0 ? "" : JSON.stringify(kept);
}

/** One bin's colour or dirty mark changed; the rest of the sheet stays. */
export function updateBinMark(
  marks: BinMark[],
  bin: number,
  change: Partial<Omit<BinMark, "bin">>,
): BinMark[] {
  const current = marks.find((mark) => mark.bin === bin) ?? {
    bin,
    color: null,
    dirty: false,
  };
  return [
    ...marks.filter((mark) => mark.bin !== bin),
    { ...current, ...change },
  ].sort((a, b) => a.bin - b.bin);
}

export interface BinLine {
  description: string;
  binNumber?: number | null;
}

export interface BinRow<T extends BinLine> extends BinMark {
  lines: T[];
}

/**
 * Every bin the lines use, plus a bin circled for dirty dishes after its
 * lines moved, in bin order. A colour on a bin no line uses any more is not
 * counted. Each bin lists what is in it, so a missing bin can be found by the
 * other items it holds.
 */
export function binRows<T extends BinLine>(
  lines: T[],
  marks: BinMark[],
): BinRow<T>[] {
  const numbers = new Set<number>();
  for (const line of lines) if (line.binNumber) numbers.add(line.binNumber);
  for (const mark of marks) if (mark.dirty) numbers.add(mark.bin);
  return [...numbers]
    .sort((a, b) => a - b)
    .map((bin) => {
      const mark = marks.find((row) => row.bin === bin);
      return {
        bin,
        color: mark?.color ?? null,
        dirty: mark?.dirty ?? false,
        lines: lines.filter((line) => line.binNumber === bin),
      };
    });
}

/** "Green (Buffet area): 3 bins - 2, 5, 12" lines for the unload check. */
export function binColorSummary(
  rows: Array<Pick<BinMark, "bin" | "color">>,
): string[] {
  const out: string[] = [];
  for (const color of BIN_COLORS) {
    const bins = rows.filter((row) => row.color === color.value);
    if (bins.length === 0) continue;
    out.push(
      `${color.label} (${color.place}): ${bins.length} ${bins.length === 1 ? "bin" : "bins"} - ${bins.map((row) => row.bin).join(", ")}`,
    );
  }
  const plain = rows.filter((row) => row.color == null);
  if (plain.length > 0)
    out.push(
      `No colour yet: ${plain.length} ${plain.length === 1 ? "bin" : "bins"} - ${plain.map((row) => row.bin).join(", ")}`,
    );
  return out;
}

/** Lines not in any bin yet (left-off lines do not count). */
export function linesWithoutBin<
  T extends BinLine & { excludedAt?: number | null },
>(lines: T[]): T[] {
  return lines.filter((line) => !line.binNumber && line.excludedAt == null);
}
