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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Proposal Accepted
            </h1>
            <p className="text-gray-600">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
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
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-8 py-6">
            <h1 className="text-2xl font-bold text-white">
              Proposal Acceptance
            </h1>
            <p className="text-blue-100 mt-1">
              Revision {pending.revisionNumber}
              {pending.capturedAt ? ` • ${formatDate(pending.capturedAt)}` : ""}
            </p>
          </div>

          {/* Proposal Details */}
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {pending.proposal.title}
              </h2>
              <p className="text-gray-600">
                For: {pending.proposal.clientName}
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                Event Details
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Date:</span>
                  <span className="font-medium">{formattedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Guests:</span>
                  <span className="font-medium">
                    {pending.proposal.guestCount}
                  </span>
                </div>
                {pending.proposal.venueName && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Venue:</span>
                    <span className="font-medium">
                      {pending.proposal.venueName}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {formattedTotal}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    Revision {pending.revisionNumber}
                  </p>
                  {pending.changeSummary ? (
                    <p className="text-xs text-gray-400">
                      {pending.changeSummary}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {pending.proposal.terms && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Terms
                </h3>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
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
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
              <p className="text-sm text-yellow-800">
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
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {busy ? "Recording…" : "Accept Proposal"}
              </button>
              <a
                href="mailto:"
                className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Contact Us
              </a>
            </div>

            {/* Footer Info */}
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">
                This acceptance is being recorded for {pending.recipientName} (
                {pending.recipientEmail})
              </p>
              <p className="text-xs text-gray-400 mt-1">
                If this is not you, please contact us immediately.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
