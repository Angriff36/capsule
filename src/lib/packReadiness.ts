/**
 * Pack readiness (spec §13.2, AC-527/AC-539): which lines keep a pack list
 * from being marked packed. Pure - the server refuses Mark packed with these
 * words (convex/lib/packRuleReconciliation.ts) and the pack list page shows
 * them before anyone tries.
 */
export type PackReadinessLine = {
  description: string;
  status: unknown;
  sentInstead?: string | null;
  excludedAt?: number | null;
  replacementDescription?: string | null;
  coveredBy?: string | null;
  requiredCapability?: boolean | null;
  deletedAt?: number | null;
  retiredAt?: number | null;
};

/** Why this line blocks Mark packed, or null when it does not. A listed line
 * that is not packed yet does not block: the packer may send the list short. */
export function unresolvedReason(row: PackReadinessLine): string | null {
  if (row.deletedAt != null || row.retiredAt != null) return null;
  const covered =
    (row.replacementDescription ?? "").trim().length > 0 ||
    row.coveredBy != null;
  if (row.excludedAt != null)
    return row.requiredCapability === true && !covered
      ? `"${row.description}" was left off but it is a must-have. Say what stands in for it or who brings it.`
      : null;
  if (
    String(row.status) === "missing" &&
    (row.sentInstead ?? "").trim().length === 0
  )
    return `"${row.description}" is marked missing. Record what went instead, or leave it off with a reason.`;
  return null;
}

export function unresolvedReasons(rows: PackReadinessLine[]): string[] {
  return rows
    .map(unresolvedReason)
    .filter((reason): reason is string => reason != null);
}
