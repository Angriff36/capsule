import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useListLeftoverDisposition } from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { TableSkeleton } from "../../ui/primitives";
import { useEventsById } from "../facilities/useEventsById";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { FINANCE_ROUTES } from "./financeRoutes";
import {
  activeLeftovers,
  donationYearSummary,
  formatPounds,
  leftoverYears,
} from "./leftoverDispositions";

/**
 * One calendar year of food donations from event leftovers, by recipient
 * and line by line, printable for the tax file and Good Samaritan Act
 * records. Leftovers are recorded on each closeout.
 */
export function DonationSummaryPage() {
  const rows = useListLeftoverDisposition();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const recorded = useMemo(() => activeLeftovers(rows), [rows]);
  const summary = useMemo(
    () => donationYearSummary(recorded, year),
    [recorded, year],
  );
  const eventIds = useMemo(
    () =>
      rows === undefined
        ? undefined
        : summary.donations.map((row) => String(row.eventId)),
    [rows, summary],
  );
  const events = useEventsById(eventIds);
  const eventTitle = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Event";

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead print:hidden">
        <div>
          <p className="eyebrow">Finance · Donations</p>
          <h1 className="display-title mt-2">Food donation summary</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Every donation of leftover food in a year, by recipient, with
            weights, values, receipts and handling notes. Print it for the tax
            file and Good Samaritan Act records. Record leftovers on each{" "}
            <Link className="text-link" to={FINANCE_ROUTES.closeout}>
              closeout
            </Link>
            .
          </p>
        </div>
        <div className="supply-row-actions">
          <label className="field-label">
            Year
            <select
              className="input"
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            >
              {leftoverYears(recorded, currentYear).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => window.print()}
          >
            Print summary
          </button>
        </div>
      </header>
      <div className="print:hidden">
        <FinanceWorkspaceNav />
      </div>

      {rows === undefined ? (
        <TableSkeleton rows={5} />
      ) : (
        <article className="print-sheet mt-6 space-y-6">
          <header>
            <h2 className="text-xl font-semibold">
              Food donations · {summary.year}
            </h2>
            <p className="mt-1 text-base text-ink-2">
              {summary.donations.length} donation
              {summary.donations.length === 1 ? "" : "s"} ·{" "}
              {formatPounds(summary.weightLb)} ·{" "}
              {formatMoneyExact(summary.estimatedValue)} estimated value
            </p>
            <p className="mt-1 text-sm text-ink-3">
              Also this year: {formatPounds(summary.returnedToStockLb)} returned
              to stock, {formatPounds(summary.discardedLb)} discarded.
            </p>
            {summary.missingReceipts > 0 ? (
              <p className="mt-1 text-sm text-ink-2" role="status">
                {summary.missingReceipts} donation
                {summary.missingReceipts === 1 ? " has" : "s have"} no receipt
                number yet. Ask the recipient for a written acknowledgment.
              </p>
            ) : null}
          </header>

          {summary.donations.length === 0 ? (
            <div className="document-empty">
              <p>No donations recorded for {summary.year}.</p>
              <span>
                Record leftovers from the{" "}
                <Link className="text-link" to={FINANCE_ROUTES.closeout}>
                  closeout screen
                </Link>
                .
              </span>
            </div>
          ) : (
            <>
              <section className="working-ledger">
                <div className="ledger-heading">
                  <h3>By recipient</h3>
                </div>
                <div className="supply-table-wrap">
                  <table className="supply-table">
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Tax ID</th>
                        <th>Address / contact</th>
                        <th>Donations</th>
                        <th>Weight</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recipients.map((recipient) => (
                        <tr key={recipient.organization}>
                          <td>
                            <strong>{recipient.organization}</strong>
                          </td>
                          <td>{recipient.taxId ?? "—"}</td>
                          <td>
                            {[recipient.address, recipient.contact]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </td>
                          <td>{recipient.donations}</td>
                          <td>{formatPounds(recipient.weightLb)}</td>
                          <td>{formatMoneyExact(recipient.estimatedValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="working-ledger">
                <div className="ledger-heading">
                  <h3>Each donation</h3>
                </div>
                <div className="supply-table-wrap">
                  <table className="supply-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Event</th>
                        <th>Food</th>
                        <th>Recipient</th>
                        <th>Weight</th>
                        <th>Value</th>
                        <th>Receipt</th>
                        <th>Handling</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.donations.map((row) => (
                        <tr key={row._id}>
                          <td>{row.dispositionDate}</td>
                          <td>
                            <Link
                              className="text-link"
                              to={`/events/${String(row.eventId)}`}
                            >
                              {eventTitle(String(row.eventId))}
                            </Link>
                          </td>
                          <td>{row.itemDescription}</td>
                          <td>{row.recipientOrganization ?? "—"}</td>
                          <td>{formatPounds(row.weightLb)}</td>
                          <td>{formatMoneyExact(row.estimatedValue)}</td>
                          <td>{row.receiptReference ?? "—"}</td>
                          <td>{row.handlingNote ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          <p className="text-sm text-ink-3">
            Food donated in good faith to a nonprofit is protected under the
            Bill Emerson Good Samaritan Food Donation Act. Keep the recipients'
            written acknowledgments with this summary. Confirm the deduction
            with your tax adviser.
          </p>
        </article>
      )}
    </div>
  );
}
