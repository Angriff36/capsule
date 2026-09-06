import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";
import { formatDate, formatMoneyExact, formatTime } from "../../lib/format";
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

function formatTimelineWindow(startsAt: number, endsAt: number | null) {
  const start = `${formatDate(startsAt)} at ${formatTime(startsAt)}`;
  if (endsAt == null) return start;
  const end =
    formatDate(endsAt) === formatDate(startsAt)
      ? formatTime(endsAt)
      : `${formatDate(endsAt)} at ${formatTime(endsAt)}`;
  return `${start} – ${end}`;
}

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
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <TableSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="This link isn't available"
            detail="The proposal link was revoked, expired, or is invalid. Please request a new link."
          />
        </div>
      </div>
    );
  }

  const { proposal, lineItems, enhancements } = data;
  const sectionVisible = (section: string) =>
    proposal.visibleSections.length === 0 ||
    proposal.visibleSections.includes(section);
  const formattedDate = proposal.eventDate
    ? formatDate(proposal.eventDate)
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
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-panel rounded-sm shadow-lg overflow-hidden">
          <div className="border-b border-line bg-brand-soft px-8 py-6">
            <h1 className="text-xl font-bold text-brand">{proposal.title}</h1>
            <p className="text-ink-2 mt-1">
              Prepared for {data.clientName}
              {proposal.proposalNumber ? ` · ${proposal.proposalNumber}` : ""}
            </p>
            <p className="text-ink-3 text-2xs mt-1">
              Revision {data.revisionNumber}
              {data.capturedAt ? ` · ${formatDate(data.capturedAt)}` : ""}
            </p>
            {proposal.expiresAt ? (
              <p className="text-ink-3 text-2xs mt-1">
                Valid through {formatDate(proposal.expiresAt)}
              </p>
            ) : null}
          </div>

          <div className="p-8">
            {sectionVisible("event_summary") ? (
              <div className="bg-inset rounded-sm p-6 mb-6">
                <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-4">
                  Event Details
                </h2>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-ink-2">Date:</span>
                    <span className="font-medium">{formattedDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-2">Guests:</span>
                    <span className="font-medium">{proposal.guestCount}</span>
                  </div>
                  {proposal.venueName && (
                    <div className="flex justify-between">
                      <span className="text-ink-2">Venue:</span>
                      <span className="font-medium">{proposal.venueName}</span>
                    </div>
                  )}
                  {proposal.eventType && (
                    <div className="flex justify-between">
                      <span className="text-ink-2">Service:</span>
                      <span className="font-medium">{proposal.eventType}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {sectionVisible("menu_sections") &&
            data.dishSelections.length > 0 ? (
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-xs font-bold text-ink uppercase tracking-wide">
                    Menu
                  </h2>
                  <span className="h-px flex-1 bg-ink" aria-hidden="true" />
                </div>
                <div className="divide-y divide-line">
                  {data.dishSelections.map((dish, index) => (
                    <div className="py-2" key={index}>
                      <p className="text-ink">{dish.dishName}</p>
                      {dish.dishDescription ? (
                        <p className="text-2xs text-ink-3">
                          {dish.dishDescription}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {sectionVisible("timeline") && data.timeline.length > 0 ? (
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-xs font-bold text-ink uppercase tracking-wide">
                    Timeline
                  </h2>
                  <span className="h-px flex-1 bg-ink" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  {data.timeline.map((item, index) => (
                    <div className="flex justify-between gap-4" key={index}>
                      <span className="text-ink">{item.name}</span>
                      <span className="text-ink-2">
                        {formatTimelineWindow(item.startsAt, item.endsAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {sectionVisible("venue_logistics") &&
              venueLogisticsRows.length > 0 && (
                <div className="bg-inset rounded-sm p-6 mb-6">
                  <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-4">
                    Venue Logistics
                  </h2>
                  <div className="space-y-2">
                    {venueLogisticsRows.map(([label, value], index) => (
                      <div key={index} className="flex justify-between gap-4">
                        <span className="text-ink-2">{label}:</span>
                        <span className="font-medium text-right whitespace-pre-wrap">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {sectionVisible("pricing_summary") && lineItems.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-3">
                  Pricing Breakdown
                </h2>
                <div className="divide-y divide-line">
                  {lineItems.map((line, index) => (
                    <div
                      key={index}
                      className="py-2 flex justify-between gap-4"
                    >
                      <div>
                        <p className="text-ink">{line.description}</p>
                        <p className="text-2xs text-ink-3">
                          {PRICING_BASIS_LABEL[line.pricingBasis] ??
                            line.pricingBasis}
                          {line.unit ? ` · ${line.unit}` : ""}
                        </p>
                      </div>
                      <span className="font-medium text-ink whitespace-nowrap">
                        {formatMoneyExact(line.amount ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sectionVisible("enhancements") && enhancements.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-3">
                  Optional Enhancements
                </h2>
                <div className="divide-y divide-line">
                  {enhancements.map((item, index) => (
                    <div
                      key={index}
                      className="py-2 flex justify-between gap-4"
                    >
                      <div>
                        <p className="text-ink">{item.name}</p>
                        {item.description ? (
                          <p className="text-2xs text-ink-3">
                            {item.description}
                          </p>
                        ) : null}
                      </div>
                      <span className="font-medium text-ink whitespace-nowrap">
                        {formatMoneyExact(item.price ?? 0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sectionVisible("pricing_summary") ? (
              <div className="bg-info-soft border-l-4 border-info p-6 mb-6 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-ink-2">Subtotal</span>
                  <span className="font-medium">
                    {formatMoneyExact(proposal.subtotal ?? 0)}
                  </span>
                </div>
                {proposal.taxAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-2">Tax</span>
                    <span className="font-medium">
                      {formatMoneyExact(proposal.taxAmount ?? 0)}
                    </span>
                  </div>
                )}
                {proposal.discountAmount > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-ink-2">Discount</span>
                    <span className="font-medium">
                      -{formatMoneyExact(proposal.discountAmount ?? 0)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-info/40">
                  <span className="text-ink-2">Total</span>
                  <span className="text-xl font-bold text-ink">
                    {formatMoneyExact(proposal.total ?? 0)}
                  </span>
                </div>
              </div>
            ) : null}

            {sectionVisible("terms") && proposal.terms && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-2">
                  Terms
                </h2>
                <p className="text-ink-2 text-xs whitespace-pre-wrap">
                  {proposal.terms}
                </p>
              </div>
            )}

            {proposal.notes && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-wide mb-2">
                  Notes
                </h2>
                <p className="text-ink-2 text-xs whitespace-pre-wrap">
                  {proposal.notes}
                </p>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-line text-center">
              <p className="text-2xs text-ink-3">
                {linkExpiresAt != null
                  ? `This link expires ${formatDate(linkExpiresAt)}. `
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
