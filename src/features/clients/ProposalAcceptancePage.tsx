import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";
import { formatDate, formatMoneyExact } from "../../lib/format";
import { publicErrorMessage } from "../../lib/publicErrorMessage";
import { ErrorState, TableSkeleton } from "../../ui/primitives";

/**
 * Client-facing proposal acceptance page (#115).
 *
 * Public route (no auth) accessed via signature request token — the
 * SignatureRequest's Convex `_id`, minted into the /accept/<token> link at
 * request time. Data and acceptance go through the authored public seam
 * `convex/signatureAcceptance.ts` (token-authorized, shareLinks posture);
 * the seam completes the request AND accepts the proposal in one mutation.
 */
// callbackToken is a prop: App renders this page directly off useMatch (no
// <Route> context), so useParams() here would always be empty and every link
// would read "Invalid acceptance link". Same pattern as ClientPortalPage.
export function ProposalAcceptancePage({
  callbackToken,
}: {
  callbackToken: string;
}) {
  const [error, setError] = useState<unknown>(null);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useQuery(
    api.signatureAcceptance.getPendingSignatureRequest,
    callbackToken ? { token: callbackToken } : "skip",
  );
  const complete = useMutation(api.signatureAcceptance.completeSignature);

  const handleAccept = async () => {
    if (!callbackToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await complete({
        token: callbackToken,
        signerUserAgent: navigator.userAgent,
      });
      setAccepted(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <div className="bg-panel rounded-lg shadow-lg p-8 text-center">
            <div className="text-ok text-6xl mb-4">✓</div>
            <h1 className="text-2xl font-bold text-ink mb-2">
              Proposal Accepted
            </h1>
            <p className="text-ink-2">
              Thank you! Your acceptance has been recorded. We'll be in touch
              shortly to confirm the next steps.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!callbackToken || pending === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="Unable to load acceptance page"
            detail="This acceptance link is invalid, expired, or already used. Please contact us if this problem persists."
          />
        </div>
      </div>
    );
  }

  if (pending === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <TableSkeleton rows={3} />
        </div>
      </div>
    );
  }

  const formattedTotal = formatMoneyExact(Number(pending.proposal.total));
  const formattedDate = pending.proposal.eventDate
    ? formatDate(pending.proposal.eventDate)
    : "TBD";

  return (
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-panel rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="border-b border-line bg-brand-soft px-8 py-6">
            <h1 className="text-2xl font-bold text-brand">
              Proposal Acceptance
            </h1>
            <p className="text-ink-2 mt-1">
              Revision {pending.revisionNumber}
              {pending.capturedAt ? ` • ${formatDate(pending.capturedAt)}` : ""}
            </p>
          </div>

          {/* Proposal Details */}
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-ink mb-2">
                {pending.proposal.title}
              </h2>
              <p className="text-ink-2">For: {pending.proposal.clientName}</p>
            </div>

            <div className="bg-inset rounded-lg p-6 mb-6">
              <h3 className="text-sm font-semibold text-ink-3 uppercase tracking-wide mb-4">
                Event Details
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-ink-2">Date:</span>
                  <span className="font-medium">{formattedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Guests:</span>
                  <span className="font-medium">
                    {pending.proposal.guestCount}
                  </span>
                </div>
                {pending.proposal.venueName && (
                  <div className="flex justify-between">
                    <span className="text-ink-2">Venue:</span>
                    <span className="font-medium">
                      {pending.proposal.venueName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {pending.enhancements.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-ink-3 uppercase tracking-wide mb-3">
                  Optional Enhancements
                </h3>
                <ul className="space-y-2 text-sm text-ink-2">
                  {pending.enhancements.map((item, index) => (
                    <li
                      key={index}
                      className="flex justify-between gap-4 border-b border-line pb-2 last:border-0"
                    >
                      <span>
                        {item.name}
                        {item.description ? (
                          <span className="block text-xs text-ink-3">
                            {item.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-medium text-ink whitespace-nowrap">
                        {formatMoneyExact(item.price ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-info-soft border-l-4 border-info p-6 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-ink-2 mb-1">Total Amount</p>
                  <p className="text-3xl font-bold text-ink">
                    {formattedTotal}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-ink-3">
                    Revision {pending.revisionNumber}
                  </p>
                  {pending.changeSummary ? (
                    <p className="text-xs text-ink-3">
                      {pending.changeSummary}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {pending.proposal.terms && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-ink-3 uppercase tracking-wide mb-2">
                  Terms
                </h3>
                <p className="text-ink-2 text-sm whitespace-pre-wrap">
                  {pending.proposal.terms}
                </p>
              </div>
            )}

            {error ? (
              <div className="mb-6">
                <ErrorState
                  title="Unable to record acceptance"
                  detail={publicErrorMessage(
                    error,
                    "Please contact us if this problem persists",
                  )}
                />
              </div>
            ) : null}

            {/* Acceptance Notice */}
            <div className="bg-warn-soft border-l-4 border-warn p-4 mb-6">
              <p className="text-sm text-warn">
                By clicking "Accept Proposal," you confirm that you have
                reviewed and agree to the proposal terms and pricing shown
                above.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={handleAccept}
                disabled={busy}
                className="btn btn-primary flex-1 justify-center"
              >
                {busy ? "Recording…" : "Accept Proposal"}
              </button>
              <a href="mailto:" className="btn btn-ghost flex-1 justify-center">
                Contact Us
              </a>
            </div>

            {/* Footer Info */}
            <div className="mt-8 pt-6 border-t border-line text-center">
              <p className="text-xs text-ink-3">
                This acceptance is being recorded for {pending.recipientName} (
                {pending.recipientEmail})
              </p>
              <p className="text-xs text-ink-3 mt-1">
                If this is not you, please contact us immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
