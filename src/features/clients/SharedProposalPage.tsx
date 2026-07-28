import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";
import { ErrorState, TableSkeleton } from "../../ui/primitives";

/**
 * Client-facing shared proposal view (spec §4.6).
 *
 * Public route (no auth) reached via a ShareLink token (`/share/:token`). The
 * link is pinned to an immutable ProposalRevision, so the client sees the exact
 * terms that were shared regardless of later edits. A view is recorded
 * (first/last view + viewer identity when known) on first load.
 */
const PRICING_BASIS_LABEL: Record<string, string> = {
  per_person: "Per person",
  per_unit: "Per unit",
  flat: "Flat",
  percentage: "Percentage",
  package: "Package",
};

const money = (value: number | null | undefined): string =>
  (Number(value ?? 0) || 0).toFixed(2);

// token comes in as a prop: App renders this page directly off useMatch (no
// <Route> context), so useParams() here would always be empty and the query
// would stay skipped forever — an endless skeleton. Same pattern as
// ClientPortalPage.
export function SharedProposalPage({ token }: { token: string }) {
  const data = useQuery(
    api.shareLinks.getSharedProposal,
    token ? { token } : "skip",
  );
  const recordView = useMutation(api.shareLinks.recordShareView);
  const recordedRef = useRef<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    if (!token || !data?.ok) return;
    if (recordedRef.current === token) return;
    recordedRef.current = token;
    setLinkExpiresAt(data.linkExpiresAt);
    // Best-effort viewer identity (IP when reachable, else UA hint).
    void (async () => {
      let identity = `anonymous · ${navigator.userAgent.slice(0, 80)}`;
      try {
        const res = await fetch("https://api.ipify.org?format=json");
        const json = (await res.json()) as { ip?: string };
        if (json.ip)
          identity = `${json.ip} · ${navigator.userAgent.slice(0, 80)}`;
      } catch {
        /* offline / blocked — keep UA-only identity */
      }
      try {
        await recordView({ token, viewerIdentity: identity });
      } catch {
        /* best-effort; never block the client's view */
      }
    })();
  }, [token, data, recordView]);

  if (data === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8">
          <TableSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="This link isn't available"
            detail="The proposal link was revoked, expired, or is invalid. Please request a new link."
          />
        </div>
      </div>
    );
  }

  const { proposal, lineItems } = data;
  const formattedDate = proposal.eventDate
    ? new Date(proposal.eventDate).toLocaleDateString()
    : "TBD";

  // §5.2 L263 "Venue logistics snapshot": render the frozen venue logistics
  // (§8.2) when the shared revision captured a linked venue. Only non-null
  // fields are shown, so an unlinked proposal renders no empty section.
  const venueLogisticsRows: Array<[string, string]> = [];
  const vl = data.venueLogistics;
  if (vl) {
    if (vl.onPremise !== null)
      venueLogisticsRows.push([
        "Service type",
        vl.onPremise ? "On-premise" : "Off-premise",
      ]);
    if (vl.capacity !== null)
      venueLogisticsRows.push(["Capacity", `${vl.capacity}`]);
    if (vl.loadInInstructions)
      venueLogisticsRows.push(["Load-in", vl.loadInInstructions]);
    if (vl.powerAvailable !== null)
      venueLogisticsRows.push([
        "Power",
        vl.powerAvailable ? "Available" : "Not available",
      ]);
    if (vl.waterAccess !== null)
      venueLogisticsRows.push([
        "Water",
        vl.waterAccess ? "Available" : "Not available",
      ]);
    if (vl.hasStairs !== null)
      venueLogisticsRows.push(["Stairs", vl.hasStairs ? "Yes" : "No"]);
    if (vl.hasFreightElevator !== null)
      venueLogisticsRows.push([
        "Freight elevator",
        vl.hasFreightElevator ? "Yes" : "No",
      ]);
    if (vl.parkingAvailable !== null)
      venueLogisticsRows.push([
        "Parking",
        vl.parkingAvailable ? "Available" : "Not available",
      ]);
    if (vl.kitchenAccess)
      venueLogisticsRows.push(["Kitchen access", vl.kitchenAccess]);
    if (vl.wasteRules) venueLogisticsRows.push(["Waste rules", vl.wasteRules]);
    if (vl.permitsInsuranceNotes)
      venueLogisticsRows.push([
        "Permits / insurance",
        vl.permitsInsuranceNotes,
      ]);
    if (vl.restrictions)
      venueLogisticsRows.push(["Restrictions", vl.restrictions]);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 px-8 py-6">
            <h1 className="text-2xl font-bold text-white">{proposal.title}</h1>
            <p className="text-blue-100 mt-1">
              Prepared for {data.clientName}
              {proposal.proposalNumber ? ` · ${proposal.proposalNumber}` : ""}
            </p>
            <p className="text-blue-200 text-xs mt-1">
              Revision {data.revisionNumber}
              {data.capturedAt
                ? ` · ${new Date(data.capturedAt).toLocaleDateString()}`
                : ""}
            </p>
          </div>

          <div className="p-8">
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
                  <span className="font-medium">{proposal.guestCount}</span>
                </div>
                {proposal.venueName && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Venue:</span>
                    <span className="font-medium">{proposal.venueName}</span>
                  </div>
                )}
                {proposal.eventType && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service:</span>
                    <span className="font-medium">{proposal.eventType}</span>
                  </div>
                )}
              </div>
            </div>

            {venueLogisticsRows.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-6 mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
                  Venue Logistics
                </h3>
                <div className="space-y-2">
                  {venueLogisticsRows.map(([label, value], index) => (
                    <div key={index} className="flex justify-between gap-4">
                      <span className="text-gray-600">{label}:</span>
                      <span className="font-medium text-right whitespace-pre-wrap">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {lineItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Pricing Breakdown
                </h3>
                <div className="divide-y divide-gray-100">
                  {lineItems.map((line, index) => (
                    <div
                      key={index}
                      className="py-2 flex justify-between gap-4"
                    >
                      <div>
                        <p className="text-gray-900">{line.description}</p>
                        <p className="text-xs text-gray-400">
                          {PRICING_BASIS_LABEL[line.pricingBasis] ??
                            line.pricingBasis}
                          {line.unit ? ` · ${line.unit}` : ""}
                        </p>
                      </div>
                      <span className="font-medium text-gray-900 whitespace-nowrap">
                        ${money(line.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border-l-4 border-blue-500 p-6 mb-6 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">${money(proposal.subtotal)}</span>
              </div>
              {proposal.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-medium">
                    ${money(proposal.taxAmount)}
                  </span>
                </div>
              )}
              {proposal.discountAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount</span>
                  <span className="font-medium">
                    -${money(proposal.discountAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-blue-100">
                <span className="text-gray-600">Total</span>
                <span className="text-2xl font-bold text-gray-900">
                  ${money(proposal.total)}
                </span>
              </div>
            </div>

            {proposal.terms && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Terms
                </h3>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
                  {proposal.terms}
                </p>
              </div>
            )}

            {proposal.notes && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Notes
                </h3>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
                  {proposal.notes}
                </p>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
              <p className="text-xs text-gray-500">
                {linkExpiresAt != null
                  ? `This link expires ${new Date(linkExpiresAt).toLocaleDateString()}. `
                  : ""}
                This proposal reflects the terms shared with you; any updates
                will come as a new link.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
