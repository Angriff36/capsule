import { useState } from "react";
import { useParams } from "react-router-dom";
import { type Id } from "../../lib/api";
import { formatDate, formatMoney, formatTime } from "../../lib/format";
import { useProposalPreview } from "../../lib/useEventRows";
import { useTenantBranding } from "../admin/tenantBranding";
import { useGenerateProposalDraft } from "../clients/ProposalDraftCheck";
import { useSendProposalWithRevisionCapture } from "../clients/useSendProposalWithRevisionCapture";
import { ErrorState, PageHeader, TableSkeleton } from "../../ui/primitives";
import { classifyCommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import "./EventAllergenBriefingPage.css";

const BASIS_LABEL: Record<string, string> = {
  per_person: "per guest",
  per_unit: "each",
  flat: "",
  package: "",
  percentage: "%",
};

/**
 * One-click proposal (owner, 2026-10-13): opened in its own tab from the
 * event, built fresh from the event's menu, prices, date and venue, ready to
 * print or save as PDF. Nothing is saved until someone presses Send to
 * client; then Capsule saves it, marks it sent and tracks it on the event.
 */
export function EventProposalPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const preview = useProposalPreview(id);
  const { branding } = useTenantBranding();
  const generate = useGenerateProposalDraft();
  const send = useSendProposalWithRevisionCapture();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  if (!id) {
    return (
      <ErrorState
        title="Event not found"
        detail="This link doesn't point to an event. Open the event again."
      />
    );
  }
  if (preview === undefined) {
    return (
      <div className="operations-stage supply-stage">
        <TableSkeleton rows={8} />
      </div>
    );
  }

  const facts = preview.facts;
  const when =
    facts.eventDate != null
      ? `${formatDate(facts.eventDate)} ${formatTime(facts.eventDate)}`
      : "Date to be set";

  const sendToClient = async () => {
    setBusy(true);
    setFailure(null);
    try {
      // Saved only now: build the proposal, then send it with its version
      // record, the one way a sent proposal is tracked.
      // A price list priced by hand goes out as it stands; otherwise the
      // proposal is built from the event first.
      const built = preview.sendAsIs
        ? preview.sendAsIs
        : await generate({ eventId: id as Id<"events"> });
      await send({ docId: built.proposalId, version: built.version });
      const target = `/events/${id}?tab=margin&proposal=${built.proposalId}#proposal`;
      if (window.opener && !window.opener.closed) {
        window.opener.location.assign(target);
        window.close();
      } else {
        window.location.assign(target);
      }
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="operations-stage supply-stage">
      <div className="briefing-no-print">
        <PageHeader
          title={`Proposal · ${preview.title}`}
          lead="Built from the event just now. Nothing is saved until you send it to the client."
          actions={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => window.print()}
              >
                Print / Save PDF
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !preview.hasClient}
                title={
                  preview.hasClient
                    ? undefined
                    : "Add the client to the event first."
                }
                onClick={() => void sendToClient()}
              >
                {busy ? "Sending…" : "Send to client"}
              </button>
            </>
          }
        />
        {!preview.hasClient ? (
          <p className="mt-3 text-base text-warn" role="status">
            This event has no client yet. Add the client on the event, then
            send.
          </p>
        ) : null}
        {failure ? (
          <FailureBanner failure={classifyCommandFailure(failure)} />
        ) : null}
      </div>

      <article className="briefing-document print-sheet mx-auto mt-6 w-full max-w-200 p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                className="mb-2 h-12 w-auto object-contain"
              />
            ) : null}
            <p className="font-semibold text-ink">{branding.displayName}</p>
            {branding.address ? (
              <p className="text-sm text-ink-2">{branding.address}</p>
            ) : null}
          </div>
          <div className="text-right">
            <h2 className="text-xl font-semibold text-ink">Proposal</h2>
            <p className="text-sm text-ink-2">
              Prepared {formatDate(Date.now())} · valid {preview.validityDays}{" "}
              days
            </p>
          </div>
        </header>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-ink-3 uppercase">For</p>
            <p className="text-base text-ink">
              {preview.clientName ?? "Client to be added"}
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-3 uppercase">Event</p>
            <p className="text-base text-ink">{preview.title}</p>
            <p className="text-sm text-ink-2">{when}</p>
            <p className="text-sm text-ink-2">
              {facts.guestCount} guests
              {facts.eventType ? ` · ${facts.eventType}` : ""}
            </p>
            {facts.venueName ? (
              <p className="text-sm text-ink-2">
                {facts.venueName}
                {facts.venueAddress ? ` · ${facts.venueAddress}` : ""}
              </p>
            ) : null}
          </div>
        </section>

        <table className="supply-table mt-6 w-full" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Price</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {preview.lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-ink-2">
                  The event has no menu or priced items yet.
                </td>
              </tr>
            ) : (
              preview.lines.map((line, index) => (
                <tr key={`${line.description}-${index}`}>
                  <td>{line.description}</td>
                  <td className="text-right">
                    {line.pricingBasis === "percentage"
                      ? `${line.unitPrice}%`
                      : `${formatMoney(line.unitPrice)} ${BASIS_LABEL[line.pricingBasis] ?? ""}`}
                  </td>
                  <td className="text-right">
                    {line.pricingBasis === "percentage"
                      ? ""
                      : line.pricingBasis === "per_person"
                        ? facts.guestCount
                        : line.quantity}
                  </td>
                  <td className="text-right">{formatMoney(line.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right">
                Subtotal
              </td>
              <td className="text-right">{formatMoney(preview.subtotal)}</td>
            </tr>
            {preview.discountAmount > 0 ? (
              <tr>
                <td colSpan={3} className="text-right">
                  Discount
                </td>
                <td className="text-right">
                  −{formatMoney(preview.discountAmount)}
                </td>
              </tr>
            ) : null}
            {preview.taxAmount != null ? (
              <tr>
                <td colSpan={3} className="text-right">
                  Sales tax
                </td>
                <td className="text-right">{formatMoney(preview.taxAmount)}</td>
              </tr>
            ) : null}
            <tr>
              <td colSpan={3} className="text-right font-semibold">
                Total
              </td>
              <td className="text-right font-semibold">
                {formatMoney(preview.total)}
              </td>
            </tr>
          </tfoot>
        </table>
        {preview.taxAmount == null ? (
          <p className="mt-2 text-right text-sm text-ink-2">
            Sales tax is worked out when the proposal is sent.
          </p>
        ) : null}

        {preview.notes ? (
          <section className="mt-6">
            <h3 className="font-semibold text-ink">Notes</h3>
            <p className="mt-1 text-sm whitespace-pre-line text-ink-2">
              {preview.notes}
            </p>
          </section>
        ) : null}
        {preview.terms ? (
          <section className="mt-6">
            <h3 className="font-semibold text-ink">Terms</h3>
            <p className="mt-1 text-sm whitespace-pre-line text-ink-2">
              {preview.terms}
            </p>
          </section>
        ) : null}
      </article>
    </div>
  );
}
