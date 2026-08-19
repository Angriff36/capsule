import { formatMoneyExact } from "../../lib/format";
import type { EventBillingRollup } from "./invoiceBilling";

type CloseoutMoneyRow = {
  status?: string | null;
  actualRevenue?: number | null;
};

/**
 * A draft closeout with no reconciled revenue is still waiting on truth —
 * the EventClosedOut cascade seeds drafts with zero actuals, so printing
 * that $0 as "revenue" lies whenever priced work exists.
 */
export function isUnreconciledCloseout(row: CloseoutMoneyRow): boolean {
  return (
    String(row.status) === "draft" && !(Number(row.actualRevenue ?? 0) > 0)
  );
}

function billingParts(billing: EventBillingRollup): string[] {
  const parts: string[] = [];
  if (billing.billedTotal > 0) {
    parts.push(`Billed ${formatMoneyExact(billing.billedTotal)}`);
  }
  if (billing.collectedTotal > 0) {
    parts.push(`Collected ${formatMoneyExact(billing.collectedTotal)}`);
  }
  if (billing.draftTotal > 0) {
    parts.push(
      `${formatMoneyExact(billing.draftTotal)} in ${billing.draftCount} draft invoice${billing.draftCount === 1 ? "" : "s"}`,
    );
  }
  return parts;
}

/**
 * Revenue line for a closeout row. Reconciled numbers print as before;
 * unreconciled drafts show what the event's invoices actually say instead
 * of pretending revenue is $0.
 */
export function CloseoutRevenueNote({
  row,
  billing,
}: {
  row: CloseoutMoneyRow;
  billing: EventBillingRollup;
}) {
  if (!isUnreconciledCloseout(row)) {
    return (
      <small>Revenue {formatMoneyExact(Number(row.actualRevenue ?? 0))}</small>
    );
  }
  const parts = billingParts(billing);
  return (
    <small>
      Not reconciled
      {parts.length > 0 ? ` — ${parts.join(" · ")}` : " — nothing billed yet"}
    </small>
  );
}

/**
 * Invoice provenance under the capture form's revenue field, mirroring the
 * clocked-labor provenance: shows billed vs collected vs drafted so finance
 * reconciles against invoices, not the proposal quote.
 */
export function BillingProvenance({
  billing,
}: {
  billing: EventBillingRollup | null | undefined;
}) {
  if (billing == null) {
    return <span className="text-xs text-ink-3">Loading invoice totals…</span>;
  }
  if (
    billing.billedCount === 0 &&
    billing.draftCount === 0 &&
    billing.collectedTotal === 0
  ) {
    return (
      <span className="text-xs text-warn">
        No invoices are linked to this event — the quoted price is only a
        starting point until billing catches up.
      </span>
    );
  }
  return (
    <span className="text-xs text-ink-3">
      {billing.billedCount > 0
        ? `Billed ${formatMoneyExact(billing.billedTotal)} across ${billing.billedCount} invoice${billing.billedCount === 1 ? "" : "s"} · Collected ${formatMoneyExact(billing.collectedTotal)}`
        : "Nothing billed yet"}
      {billing.draftCount > 0 ? (
        <span className="text-warn">
          {" "}
          — {formatMoneyExact(billing.draftTotal)} still in {billing.draftCount}{" "}
          unsent draft
          {billing.draftCount === 1 ? "" : "s"} (drafts are not revenue)
        </span>
      ) : null}
    </span>
  );
}
