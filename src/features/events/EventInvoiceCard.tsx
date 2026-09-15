import { Link } from "react-router-dom";
import { useListInvoice } from "../../lib/manifest-convex-react";
import { formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { formatInvoiceNumber } from "../finance/invoiceNumberDisplay";
import { EventOverviewCard } from "./EventOverviewCard";

const CLOSED_STATUSES = new Set(["paid", "voided", "written_off"]);

/** Where finance issues a new invoice already scoped to this event. */
export function eventIssueInvoicePath(eventId: string): string {
  return `/finance/invoices?event=${encodeURIComponent(eventId)}&issue=1`;
}

function invoiceDetailPath(invoiceId: string): string {
  return `/finance/invoices/${invoiceId}`;
}

/**
 * The event's invoices, reachable from the event itself. Approval already
 * drafts one invoice per event (EventApproved → Invoice.issue), so this card
 * is what stops an operator from issuing a second one by hand from Finance
 * because they never saw the first (#136). Open invoices lead; closed ones
 * stay listed so a paid job still shows what it was billed as.
 */
export function EventInvoiceCard({
  eventId,
  currencyCode,
}: {
  readonly eventId: string;
  readonly currencyCode: string;
}) {
  const invoices = useListInvoice();
  const loading = invoices === undefined;
  const rows = (invoices ?? [])
    .filter((row) => row.deletedAt == null && String(row.eventId) === eventId)
    .sort((a, b) => {
      const aClosed = CLOSED_STATUSES.has(String(a.status)) ? 1 : 0;
      const bClosed = CLOSED_STATUSES.has(String(b.status)) ? 1 : 0;
      return aClosed - bClosed || (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
  const hasOpen = rows.some((row) => !CLOSED_STATUSES.has(String(row.status)));

  return (
    <EventOverviewCard
      title="Invoicing"
      testId="event-invoice-card"
      aside={
        <Link
          to={eventIssueInvoicePath(eventId)}
          className="text-base font-medium text-link hover:underline"
        >
          {hasOpen ? "Issue another invoice" : "Issue invoice"}
        </Link>
      }
    >
      {loading ? (
        <p className="text-sm text-ink-2">Loading invoices…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-2">
          No invoice for this event yet. Approving the event drafts one from the
          quoted price automatically; use “Issue invoice” to bill it sooner or
          on different terms.
        </p>
      ) : (
        <ul className="divide-y divide-line-2" data-testid="event-invoice-list">
          {rows.map((row) => {
            const number =
              formatInvoiceNumber(row.invoiceNumber, row._id) ??
              "Untitled draft";
            const status = String(row.status);
            const closed = CLOSED_STATUSES.has(status);
            return (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
              >
                <div className="flex items-center gap-3">
                  <Link
                    to={invoiceDetailPath(row._id)}
                    className="font-medium text-link hover:underline"
                  >
                    {number}
                  </Link>
                  <span
                    className={`chip ${closed ? "border-line-2 bg-inset text-ink-2" : ""}`}
                  >
                    {formatStatusLabel(status)}
                  </span>
                </div>
                <div className="text-sm text-ink-2">
                  {formatMoney(row.total, row.currencyCode ?? currencyCode)}
                  {!closed && row.amountDue != null && row.amountDue > 0
                    ? ` · ${formatMoney(row.amountDue, row.currencyCode ?? currencyCode)} due`
                    : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </EventOverviewCard>
  );
}
