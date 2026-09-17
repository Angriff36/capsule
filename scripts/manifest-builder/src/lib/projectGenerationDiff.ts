/**
 * Minimal unified-diff helpers for ownership three-way diagnostics.
 * Strips common prefix/suffix, then LCS on the middle (bounded for large files).
 */

const LCS_CELL_LIMIT = 1_500_000;
const TRUNCATE_LINES = 40;

function lcsIndexPairs(
  a: string[],
  b: string[],
): Array<readonly [number, number]> {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] =
        a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const pairs: Array<readonly [number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function commonPrefixLength(a: string[], b: string[]): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

function commonSuffixLength(a: string[], b: string[], prefix: number): number {
  let ai = a.length - 1;
  let bi = b.length - 1;
  let count = 0;
  while (ai >= prefix && bi >= prefix && a[ai] === b[bi]) {
    count += 1;
    ai -= 1;
    bi -= 1;
  }
  return count;
}

function truncatedMiddleDiff(
  fromLabel: string,
  toLabel: string,
  fromMid: string[],
  toMid: string[],
  oldStart: number,
  newStart: number,
): string {
  const oldSample = fromMid.slice(0, TRUNCATE_LINES);
  const newSample = toMid.slice(0, TRUNCATE_LINES);
  const lines = [
    `--- ${fromLabel}`,
    `+++ ${toLabel}`,
    `@@ -${String(oldStart)},${String(fromMid.length)} +${String(newStart)},${String(toMid.length)} @@`,
    `## diff truncated: middle too large for full LCS (${String(fromMid.length)}×${String(toMid.length)} lines)`,
  ];
  for (const line of oldSample) lines.push(`-${line}`);
  if (fromMid.length > TRUNCATE_LINES) {
    lines.push(
      `-... ${String(fromMid.length - TRUNCATE_LINES)} more removed line(s)`,
    );
  }
  for (const line of newSample) lines.push(`+${line}`);
  if (toMid.length > TRUNCATE_LINES) {
    lines.push(
      `+... ${String(toMid.length - TRUNCATE_LINES)} more added line(s)`,
    );
  }
  return lines.join("\n");
}

export function createUnifiedDiff(
  fromLabel: string,
  fromContent: string,
  toLabel: string,
  toContent: string,
  context = 3,
): string {
  if (fromContent === toContent) {
    return `--- ${fromLabel}\n+++ ${toLabel}\n`;
  }
  const fromLines = fromContent.split("\n");
  const toLines = toContent.split("\n");
  const prefix = commonPrefixLength(fromLines, toLines);
  const suffix = commonSuffixLength(fromLines, toLines, prefix);
  const fromMid = fromLines.slice(prefix, fromLines.length - suffix);
  const toMid = toLines.slice(prefix, toLines.length - suffix);

  if (fromMid.length * toMid.length > LCS_CELL_LIMIT) {
    return truncatedMiddleDiff(
      fromLabel,
      toLabel,
      fromMid,
      toMid,
      prefix + 1,
      prefix + 1,
    );
  }

  const pairs = lcsIndexPairs(fromMid, toMid);
  const ops: Array<{
    kind: "equal" | "remove" | "add";
    line: string;
    fromLine: number;
    toLine: number;
  }> = [];

  // Leading equal prefix as equal ops (for context windows).
  for (let i = Math.max(0, prefix - context); i < prefix; i += 1) {
    ops.push({
      kind: "equal",
      line: fromLines[i]!,
      fromLine: i + 1,
      toLine: i + 1,
    });
  }

  let fi = 0;
  let ti = 0;
  for (const [pf, pt] of pairs) {
    while (fi < pf) {
      ops.push({
        kind: "remove",
        line: fromMid[fi]!,
        fromLine: prefix + fi + 1,
        toLine: prefix + ti + 1,
      });
      fi += 1;
    }
    while (ti < pt) {
      ops.push({
        kind: "add",
        line: toMid[ti]!,
        fromLine: prefix + fi + 1,
        toLine: prefix + ti + 1,
      });
      ti += 1;
    }
    ops.push({
      kind: "equal",
      line: fromMid[fi]!,
      fromLine: prefix + fi + 1,
      toLine: prefix + ti + 1,
    });
    fi += 1;
    ti += 1;
  }
  while (fi < fromMid.length) {
    ops.push({
      kind: "remove",
      line: fromMid[fi]!,
      fromLine: prefix + fi + 1,
      toLine: prefix + ti + 1,
    });
    fi += 1;
  }
  while (ti < toMid.length) {
    ops.push({
      kind: "add",
      line: toMid[ti]!,
      fromLine: prefix + fi + 1,
      toLine: prefix + ti + 1,
    });
    ti += 1;
  }

  const suffixStartFrom = fromLines.length - suffix;
  const suffixStartTo = toLines.length - suffix;
  for (let i = 0; i < Math.min(context, suffix); i += 1) {
    ops.push({
      kind: "equal",
      line: fromLines[suffixStartFrom + i]!,
      fromLine: suffixStartFrom + i + 1,
      toLine: suffixStartTo + i + 1,
    });
  }

  const changeIndexes = ops
    .map((op, index) => (op.kind === "equal" ? -1 : index))
    .filter((index) => index >= 0);
  if (changeIndexes.length === 0) {
    return `--- ${fromLabel}\n+++ ${toLabel}\n`;
  }

  const linesOut = [`--- ${fromLabel}`, `+++ ${toLabel}`];
  let cursor = 0;
  while (cursor < changeIndexes.length) {
    const hunkStart = Math.max(0, changeIndexes[cursor]! - context);
    let hunkEnd = Math.min(ops.length, changeIndexes[cursor]! + context + 1);
    let look = cursor + 1;
    while (
      look < changeIndexes.length &&
      changeIndexes[look]! <= hunkEnd + context
    ) {
      hunkEnd = Math.min(ops.length, changeIndexes[look]! + context + 1);
      look += 1;
    }
    cursor = look;
    const slice = ops.slice(hunkStart, hunkEnd);
    const oldStart =
      slice.find((op) => op.kind !== "add")?.fromLine ??
      slice[0]?.fromLine ??
      1;
    const newStart =
      slice.find((op) => op.kind !== "remove")?.toLine ?? slice[0]?.toLine ?? 1;
    const oldCount = slice.filter((op) => op.kind !== "add").length;
    const newCount = slice.filter((op) => op.kind !== "remove").length;
    linesOut.push(
      `@@ -${String(oldStart)},${String(oldCount)} +${String(newStart)},${String(newCount)} @@`,
    );
    for (const op of slice) {
      if (op.kind === "equal") linesOut.push(` ${op.line}`);
      else if (op.kind === "remove") linesOut.push(`-${op.line}`);
      else linesOut.push(`+${op.line}`);
    }
  }
  return linesOut.join("\n");
}

export interface LineRegion {
  currentStartLine: number;
  currentLineCount: number;
  summary: string;
  appearsInCandidate: boolean;
}

export function changedRegionsVsCandidate(
  baselineContent: string,
  currentContent: string,
  candidateContent: string,
): LineRegion[] {
  const fromLines = baselineContent.split("\n");
  const toLines = currentContent.split("\n");
  const prefix = commonPrefixLength(fromLines, toLines);
  const suffix = commonSuffixLength(fromLines, toLines, prefix);
  const fromMid = fromLines.slice(prefix, fromLines.length - suffix);
  const toMid = toLines.slice(prefix, toLines.length - suffix);

  if (fromMid.length * toMid.length > LCS_CELL_LIMIT) {
    const sample = toMid.slice(0, TRUNCATE_LINES);
    return [
      {
        currentStartLine: prefix + 1,
        currentLineCount: toMid.length,
        summary: `large edit (${String(toMid.length)} current lines in middle)`,
        appearsInCandidate: sample.every((line) =>
          candidateContent.includes(line),
        ),
      },
    ];
  }

  const pairs = lcsIndexPairs(fromMid, toMid);
  const regions: LineRegion[] = [];
  let fi = 0;
  let ti = 0;

  const flushAdds = (start: number, lines: string[]) => {
    if (lines.length === 0) return;
    const summary = lines.join("\\n");
    regions.push({
      currentStartLine: start,
      currentLineCount: lines.length,
      summary: summary.length > 80 ? `${summary.slice(0, 77)}...` : summary,
      appearsInCandidate: lines.every((line) =>
        candidateContent.includes(line),
      ),
    });
  };

  for (const [pf, pt] of pairs) {
    const removed: string[] = [];
    while (fi < pf) {
      removed.push(fromMid[fi]!);
      fi += 1;
    }
    const added: string[] = [];
    const addStart = prefix + ti + 1;
    while (ti < pt) {
      added.push(toMid[ti]!);
      ti += 1;
    }
    if (removed.length > 0 && added.length === 0) {
      const summary = `removed: ${removed.join("\\n")}`;
      regions.push({
        currentStartLine: prefix + ti + 1,
        currentLineCount: 0,
        summary: summary.length > 80 ? `${summary.slice(0, 77)}...` : summary,
        appearsInCandidate: removed.every(
          (line) => !candidateContent.includes(line),
        ),
      });
    }
    flushAdds(addStart, added);
    fi += 1;
    ti += 1;
  }
  const trailingRemoved: string[] = [];
  while (fi < fromMid.length) {
    trailingRemoved.push(fromMid[fi]!);
    fi += 1;
  }
  if (trailingRemoved.length > 0) {
    const summary = `removed: ${trailingRemoved.join("\\n")}`;
    regions.push({
      currentStartLine: prefix + ti + 1,
      currentLineCount: 0,
      summary: summary.length > 80 ? `${summary.slice(0, 77)}...` : summary,
      appearsInCandidate: trailingRemoved.every(
        (line) => !candidateContent.includes(line),
      ),
    });
  }
  const trailingAdded: string[] = [];
  const trailingStart = prefix + ti + 1;
  while (ti < toMid.length) {
    trailingAdded.push(toMid[ti]!);
    ti += 1;
  }
  flushAdds(trailingStart, trailingAdded);
  return regions;
}
