/** The closeout money fields the Margin tab shows once a closeout is locked. */
export type CloseoutTotalsRow = {
  status: string;
  finalizedAt?: number | null;
  deletedAt?: number | null;
  actualRevenue: number;
  actualIngredientCost: number;
  actualWasteCost: number;
  actualLaborCost: number;
  actualVendorCost: number;
  totalActualCost: number;
  actualHeadcount: number;
};

/**
 * The event's locked (finalized) closeout, or null while there is none.
 * After it is locked, its actual figures replace the live estimate.
 */
export function finalCloseout<Row extends CloseoutTotalsRow>(
  rows: readonly Row[] | undefined,
): Row | null {
  let latest: Row | null = null;
  for (const row of rows ?? []) {
    if (row.status !== "finalized" || row.deletedAt != null) continue;
    if (latest == null || (row.finalizedAt ?? 0) > (latest.finalizedAt ?? 0))
      latest = row;
  }
  return latest;
}
