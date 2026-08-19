import { useMemo } from "react";
import {
  buildEventCostSummary,
  type EventCostSummaryCloseout,
  type EventCostSummaryEvent,
  type EventCostSummaryInvoice,
} from "./eventCostSummary";
import "./EventCostSummaryReport.css";
import { formatDate, formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";

const percent = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function validDate(value: Date | number | string | null | undefined) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function EventCostSummaryReport({
  event,
  closeout,
  invoices,
  onClose,
  onPrint = () => window.print(),
}: {
  event: EventCostSummaryEvent;
  closeout: EventCostSummaryCloseout;
  invoices: readonly EventCostSummaryInvoice[];
  onClose?: () => void;
  onPrint?: () => void;
}) {
  const summary = useMemo(
    () => buildEventCostSummary({ event, closeout, invoices }),
    [closeout, event, invoices],
  );
  const eventStart = validDate(event.startsAt);
  const asOf = validDate(summary.asOf);
  const maxCost = Math.max(
    1,
    ...summary.buckets.map((bucket) => bucket.amount),
  );
  const revenueDifference = summary.invoicedRevenue - summary.reconciledRevenue;

  return (
    <section className="event-cost-report-shell" aria-live="polite">
      <div className="event-cost-report-actions">
        <div>
          <span>Closeout folio</span>
          <strong>{event.title || "Untitled event"}</strong>
        </div>
        <div>
          {onClose ? (
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              Close
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" onClick={onPrint}>
            Print summary
          </button>
        </div>
      </div>

      <article
        className="event-cost-report"
        data-testid="event-cost-summary"
        aria-label={`Cost summary for ${event.title || "event"}`}
      >
        <header className="event-cost-report-header">
          <div>
            <p>CapsuleX · Event cost summary</p>
            <h2>{event.title || "Untitled event"}</h2>
            <span>
              {[
                event.eventType,
                eventStart ? formatDate(eventStart.getTime()) : null,
              ]
                .filter(Boolean)
                .join(" · ") || "Completed event"}
            </span>
          </div>
          <div className="event-cost-report-stamp">
            <span>{formatStatusLabel(summary.status)}</span>
            <strong>
              {asOf ? formatDate(asOf.getTime()) : "Not finalized"}
            </strong>
            <small>
              {summary.unreconciled && summary.headcount.actual === 0
                ? "—"
                : summary.headcount.actual}
              /{summary.headcount.expected} guests
            </small>
          </div>
        </header>

        <section
          className="event-cost-report-score"
          aria-label="Margin summary"
        >
          <div>
            <span>Billed revenue</span>
            <strong data-testid="invoiced-revenue">
              {formatMoney(summary.invoicedRevenue)}
            </strong>
            <small>
              {summary.invoiceCount} billed invoice
              {summary.invoiceCount === 1 ? "" : "s"}
              {summary.draftInvoiceCount > 0
                ? ` · ${formatMoney(summary.draftInvoiceTotal)} still in ${summary.draftInvoiceCount} draft${summary.draftInvoiceCount === 1 ? "" : "s"}`
                : ""}
            </small>
          </div>
          <div>
            <span>Total event cost</span>
            <strong data-testid="total-event-cost">
              {formatMoney(summary.totalCost)}
            </strong>
            <small>reconciled closeout</small>
          </div>
          <div className={summary.margin < 0 ? "is-negative" : "is-positive"}>
            <span>Resulting margin</span>
            <strong data-testid="resulting-margin">
              {formatMoney(summary.margin)}
            </strong>
            <small>
              {summary.marginPercent == null
                ? "No invoiced revenue"
                : `${percent.format(summary.marginPercent)}% of revenue`}
            </small>
          </div>
        </section>

        <section className="event-cost-report-breakdown">
          <div className="event-cost-report-section-heading">
            <div>
              <p>Cost ledger</p>
              <h3>Where the event spend landed</h3>
            </div>
            <strong>{formatMoney(summary.totalCost)}</strong>
          </div>

          <div className="event-cost-report-costs">
            {summary.buckets.map((bucket) => (
              <div className="event-cost-report-cost" key={bucket.key}>
                <div>
                  <span>{bucket.label}</span>
                  <strong>{formatMoney(bucket.amount)}</strong>
                </div>
                <div className="event-cost-report-bar" aria-hidden="true">
                  <i
                    className={"is-" + bucket.key}
                    style={{ width: `${(bucket.amount / maxCost) * 100}%` }}
                  />
                </div>
                <small>{bucket.source}</small>
              </div>
            ))}
          </div>
        </section>

        <footer className="event-cost-report-footer">
          <div>
            <p>Method</p>
            <span>
              Revenue adds up this event's billed invoices — sent through paid.
              Drafts are reported separately and never counted as revenue;
              deleted, voided, and written-off invoices are left out. Costs come
              from the closeout you recorded for the event; equipment/ vendor
              hire and miscellaneous/waste follow the closeout categories.
            </span>
          </div>
          <div>
            <p>Reconciliation</p>
            <span>
              {summary.unreconciled
                ? `Closeout not reconciled yet — billed ${formatMoney(summary.invoicedRevenue)} · collected ${formatMoney(summary.collectedTotal)}${
                    summary.draftInvoiceCount > 0
                      ? ` · ${formatMoney(summary.draftInvoiceTotal)} in ${summary.draftInvoiceCount} unsent draft${summary.draftInvoiceCount === 1 ? "" : "s"}`
                      : ""
                  }`
                : `Closeout revenue ${formatMoney(summary.reconciledRevenue)}${
                    Math.abs(revenueDifference) >= 0.01
                      ? ` · ${formatMoney(Math.abs(revenueDifference))} ${revenueDifference > 0 ? "more" : "less"} invoiced`
                      : " · matches invoiced revenue"
                  }`}
            </span>
            {summary.invoiceNumbers.length > 0 ? (
              <span>Invoices: {summary.invoiceNumbers.join(", ")}</span>
            ) : null}
          </div>
          {summary.notes.length > 0 ? (
            <div className="event-cost-report-notes">
              <p>Closeout notes</p>
              {summary.notes.map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          ) : null}
        </footer>
      </article>
    </section>
  );
}
