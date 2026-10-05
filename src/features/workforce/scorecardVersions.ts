// Role scorecard versions (spec §9.2). Each defined RoleScorecard row is an
// immutable version: a change defines a new row and archives the old one
// (archive stamps effectiveTo). Reviews and one-on-ones keep the id of the
// version they used, so history reads that row; this helper answers which
// version was in force for a role on a given day (the form default, and the
// answer for an older record that has no link).

export type ScorecardVersionRow = {
  _id: string;
  role: string;
  title: string;
  definedAt?: number | null;
  effectiveFrom?: number | null;
  effectiveTo?: number | null;
  deletedAt?: number | null;
};

function startsAt(row: ScorecardVersionRow) {
  return row.effectiveFrom ?? row.definedAt ?? 0;
}

export function effectiveScorecard<T extends ScorecardVersionRow>(
  rows: readonly T[] | undefined,
  role: string | null | undefined,
  at: number,
): T | null {
  if (!rows || !role) return null;
  const inForce = rows.filter(
    (row) =>
      row.deletedAt == null &&
      row.definedAt != null &&
      row.role === role &&
      startsAt(row) <= at &&
      (row.effectiveTo == null || row.effectiveTo > at),
  );
  inForce.sort((a, b) => startsAt(b) - startsAt(a));
  return inForce[0] ?? null;
}
