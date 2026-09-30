/**
 * AC-085: old money rows kept only for the record (quotes, invoices, report
 * totals, balances, credits, $0 rows, the same money seen twice). They are
 * never matched or counted, and the matching page says so.
 */
export function referenceOnlyMoneyRows(
  links: readonly {
    recordType: string;
    conflictStatus: string;
    capsuleId: string;
    rawSourceData?: string | null;
    deletedAt?: number | null;
  }[],
): number {
  return links.filter((link) => {
    if (
      link.recordType !== "payment" ||
      link.conflictStatus !== "resolved" ||
      link.capsuleId !== "" ||
      link.deletedAt != null
    )
      return false;
    try {
      return JSON.parse(link.rawSourceData ?? "{}").rowClass !== undefined;
    } catch {
      return false;
    }
  }).length;
}
