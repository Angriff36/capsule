// Mangia "Training Doc": steps a trainer initials, each with detail lines,
// and the initials kept on a training sign-off.

export interface TrainingStep {
  text: string;
  details: string[];
}

/** Steps from the module text: one per line; a "- " line is detail. */
export function parseTrainingSteps(text: string | null | undefined) {
  const steps: TrainingStep[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("- ") || line === "-") {
      const detail = line.slice(1).trim();
      const last = steps[steps.length - 1];
      if (detail && last) last.details.push(detail);
      else if (detail) steps.push({ text: detail, details: [] });
    } else steps.push({ text: line, details: [] });
  }
  return steps;
}

export interface Initial {
  step: string;
  initials: string;
  at: number;
}

/** Initialled steps stored as "step|initials|epoch ms" lines. */
export function parseInitials(text: string | null | undefined): Initial[] {
  const rows: Initial[] = [];
  for (const line of (text ?? "").split(/\r?\n/)) {
    const parts = line.split("|");
    if (parts.length < 3) continue;
    const at = Number(parts[parts.length - 1]);
    const initials = parts[parts.length - 2]!.trim();
    const step = parts.slice(0, -2).join("|").trim();
    if (!step || !Number.isFinite(at)) continue;
    rows.push({ step, initials, at });
  }
  return rows;
}

export function serializeInitials(rows: readonly Initial[]) {
  return rows
    .map(
      (row) => `${row.step.replace(/\r?\n/g, " ")}|${row.initials}|${row.at}`,
    )
    .join("\n");
}

/** Initial a step, or clear it when it is already initialled. */
export function toggleInitial(
  rows: readonly Initial[],
  step: string,
  initials: string,
  at: number,
): Initial[] {
  return rows.some((row) => row.step === step)
    ? rows.filter((row) => row.step !== step)
    : [...rows, { step, initials, at }];
}

/** "Rob Crew" -> "RC". */
export function initialsOf(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return letters.slice(0, 3) || "OK";
}

/** Steps on the module that are initialled on this sign-off. */
export function initialledCount(
  steps: readonly TrainingStep[],
  rows: readonly Initial[],
) {
  return steps.filter((step) => rows.some((row) => row.step === step.text))
    .length;
}
