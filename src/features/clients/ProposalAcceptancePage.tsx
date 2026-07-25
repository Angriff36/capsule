import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { ErrorState, TableSkeleton } from "../../ui/primitives";

/**
 * Client-facing proposal acceptance page.
 *
 * Public route (no auth) accessed via signature request token.
 * Displays proposal details and captures acceptance with IP/UserAgent audit trail.
 *
 * Flow:
 * 1. Operator sends proposal → creates ProposalRevision
 * 2. Operator creates SignatureRequest against revision
 * 3. SignatureRequest contains callbackToken (used as URL param)
 * 4. Client visits /accept/:callbackToken
 * 5. Page loads proposal details from signature request
 * 6. Client clicks "Accept" → calls SignatureRequest.complete
 * 7. SignatureRequest.complete emits SignatureCompleted event
 * 8. Manifest reaction triggers Proposal.accept
 */
export function ProposalAcceptancePage() {
  const { callbackToken } = useParams<{ callbackToken: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [accepted, setAccepted] = useState(false);
  const [signatureRequest, setSignatureRequest] = useState<{
    recipientName: string;
    recipientEmail: string;
    proposalRevision: {
      snapshot: string;
      changeSummary: string;
      revisionNumber: number;
      capturedAt: number;
    };
    status: string;
    expiresAt: number | null;
  } | null>(null);
  const [proposalData, setProposalData] = useState<{
    title: string;
    total: number;
    clientName: string;
    terms: string | null;
    eventDate: number | null;
    guestCount: number;
    venueName: string | null;
  } | null>(null);

  useEffect(() => {
    if (!callbackToken) {
      setError(new Error("Invalid acceptance link"));
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Load signature request by callback token
        const response = await fetch(
          `${import.meta.env.VITE_CONVEX_URL}/api/queries/SignatureRequest.pendingByToken`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callbackToken }),
          },
        );

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Acceptance link not found or has expired");
          }
          throw new Error(`Failed to load acceptance link: ${response.status}`);
        }

        const data = await response.json();
        if (!data || data.length === 0) {
          throw new Error("Acceptance link not found or has expired");
        }

        const sigRequest = data[0];
        setSignatureRequest(sigRequest);

        // Parse proposal snapshot
        if (sigRequest.proposalRevision?.snapshot) {
          const snapshot = JSON.parse(sigRequest.proposalRevision.snapshot);
          setProposalData({
            title: snapshot.proposal.title,
            total: snapshot.proposal.total,
            clientName: snapshot.client.name,
            terms: snapshot.proposal.terms,
            eventDate: snapshot.proposal.eventDate,
            guestCount: snapshot.proposal.guestCount,
            venueName: snapshot.proposal.venueName,
          });
        }
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [callbackToken]);

  const handleAccept = async () => {
    if (!callbackToken || !signatureRequest) return;

    try {
      setError(null);
      const ipInfo = await fetch("https://api.ipify.org?format=json")
        .then((r) => r.json())
        .catch(() => ({ ip: null }));

      const response = await fetch(
        `${import.meta.env.VITE_CONVEX_URL}/api/mutations/SignatureRequest.complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callbackToken,
            signedArtifactReference: `accepted-at-${Date.now()}`,
            signerIpAddress: ipInfo.ip,
            signerUserAgent: navigator.userAgent,
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to record acceptance");
      }

      setAccepted(true);
    } catch (err) {
      setError(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8">
          <TableSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="Unable to load acceptance page"
            detail={
              error instanceof Error
                ? error.message
                : "Please contact us if this problem persists"
            }
          />
        </div>
      </div>
    );
  }

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

  if (!proposalData || !signatureRequest) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="Proposal details unavailable"
            detail="We couldn't load the proposal details. Please contact us for assistance."
          />
        </div>
      </div>
    );
  }

  const formattedTotal = Number(proposalData.total).toFixed(2);
  const formattedDate = proposalData.eventDate
    ? new Date(proposalData.eventDate).toLocaleDateString()
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
              Revision {signatureRequest.proposalRevision.revisionNumber} •{" "}
              {new Date(
                signatureRequest.proposalRevision.capturedAt,
              ).toLocaleDateString()}
            </p>
          </div>

          {/* Proposal Details */}
          <div className="p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {proposalData.title}
              </h2>
              <p className="text-gray-600">For: {proposalData.clientName}</p>
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
                  <span className="font-medium">{proposalData.guestCount}</span>
                </div>
                {proposalData.venueName && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Venue:</span>
                    <span className="font-medium">
                      {proposalData.venueName}
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
                    ${formattedTotal}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">
                    Revision {signatureRequest.proposalRevision.revisionNumber}
                  </p>
                  <p className="text-xs text-gray-400">
                    {signatureRequest.proposalRevision.changeSummary}
                  </p>
                </div>
              </div>
            </div>

            {proposalData.terms && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Terms
                </h3>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
                  {proposalData.terms}
                </p>
              </div>
            )}

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
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Accept Proposal
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
                This acceptance is being recorded for{" "}
                {signatureRequest.recipientName} (
                {signatureRequest.recipientEmail})
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
