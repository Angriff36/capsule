import type { CapsuleEventBundleDirectory } from "./CapsuleEventBundleExistingState";

/**
 * Turns the tenant's generated list rows into the directory the bundle
 * planners match against. Pure: the agent loader feeds it HTTP query results,
 * the browser importer feeds it the same rows from the generated React hooks,
 * so a re-import resumes the same way on both paths (#241).
 */

export type BundleDirectoryRow = Record<string, unknown>;

export interface BundleDirectoryRows {
  organizations: unknown;
  people: unknown;
  vendors: unknown;
  ingredients: unknown;
  invoices: unknown;
  payments: unknown;
  proposals: unknown;
  vendorOrders: unknown;
  proposalLines: unknown;
  vendorOrderLines: unknown;
}

export function directoryRows(value: unknown): BundleDirectoryRow[] {
  return Array.isArray(value) ? (value as BundleDirectoryRow[]) : [];
}

export function liveRow(row: BundleDirectoryRow): boolean {
  return row.deletedAt == null;
}

export function rowText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function groupBy(
  items: BundleDirectoryRow[],
  keyOf: (row: BundleDirectoryRow) => string,
  valueOf: (row: BundleDirectoryRow) => string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const row of items) {
    const key = keyOf(row);
    const bucket = grouped.get(key) ?? [];
    bucket.push(valueOf(row));
    grouped.set(key, bucket);
  }
  return grouped;
}

function cents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

export function mapBundleDirectory(
  input: BundleDirectoryRows,
): CapsuleEventBundleDirectory {
  const linesByProposal = groupBy(
    directoryRows(input.proposalLines).filter(liveRow),
    (row) => String(row.proposalId),
    (row) => rowText(row.description),
  );
  const ingredientsByOrder = groupBy(
    directoryRows(input.vendorOrderLines).filter(
      (row) => liveRow(row) && row.status !== "cancelled",
    ),
    (row) => String(row.vendorOrderId),
    (row) => String(row.ingredientId),
  );
  const liveOrders = directoryRows(input.vendorOrders).filter(liveRow);
  const named = (value: unknown) =>
    directoryRows(value)
      .filter(liveRow)
      .map((row) => ({ id: String(row._id), name: rowText(row.name) }));
  return {
    organizationNames: directoryRows(input.organizations)
      .filter(liveRow)
      .flatMap((row) => [rowText(row.name), rowText(row.brandDisplayName)])
      .filter((name) => name.length > 0),
    people: directoryRows(input.people)
      .filter(liveRow)
      .map((row) => ({
        id: String(row._id),
        name: `${rowText(row.givenName)} ${rowText(row.familyName)}`.trim(),
      })),
    vendors: named(input.vendors),
    ingredients: named(input.ingredients),
    invoices: directoryRows(input.invoices)
      .filter(liveRow)
      .map((row) => ({
        id: String(row._id),
        invoiceNumber: rowText(row.invoiceNumber),
        status: rowText(row.status),
        depositAmountCents:
          row.depositAmount == null ? null : cents(row.depositAmount),
        depositPaid: row.depositPaidAt != null,
      })),
    payments: directoryRows(input.payments)
      .filter(liveRow)
      .map((row) => ({
        id: String(row._id),
        invoiceId: String(row.invoiceId),
        amountCents: cents(row.amount),
        status: rowText(row.status),
      })),
    proposals: directoryRows(input.proposals)
      .filter(liveRow)
      .map((row) => ({
        id: String(row._id),
        proposalNumber: rowText(row.proposalNumber),
        status: rowText(row.status),
        lineDescriptions: linesByProposal.get(String(row._id)) ?? [],
      })),
    vendorOrderNumbers: liveOrders.map((row) => rowText(row.orderNumber)),
    vendorOrders: liveOrders.map((row) => ({
      id: String(row._id),
      orderNumber: rowText(row.orderNumber),
      status: rowText(row.status),
      lineIngredientIds: ingredientsByOrder.get(String(row._id)) ?? [],
    })),
  };
}
