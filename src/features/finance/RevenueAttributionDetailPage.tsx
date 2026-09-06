import { useParams, useNavigate, Link } from "react-router-dom";
import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import {
  useGetRevenueAttribution,
  useGetEvent,
  useListVenue,
  useListPerson,
  useListReferralSource,
  useListClient,
  useRevenueAttributionCreate,
  useRevenueAttributionApply,
  useRevenueAttributionUpdate,
} from "../../lib/manifest-convex-react";
import { useRouteRecord } from "../../lib/routeRecord";
import { StatusChip, FormSkeleton } from "../../ui/primitives";
import {
  formatDate as formatDateShared,
  formatMoneyExact,
} from "../../lib/format";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { useActionNotice } from "../../ui/action-result";
import { eventRevenueEstimate } from "./revenueAttributionValues";

const usd = formatMoneyExact;

const formatDate = (date: string | number | null | undefined) => {
  if (!date) return "—";
  return formatDateShared(new Date(date).getTime());
};

const attributionTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    venue_commission: "Venue commission",
    sales_commission: "Sales commission",
    referral_fee: "Referral fee",
    partner_split: "Partner split",
    other: "Other",
  };
  return labels[type] ?? type;
};

type AttributionType =
  | "venue_commission"
  | "sales_commission"
  | "referral_fee"
  | "partner_split"
  | "other";

type AllocationMethod = "percent" | "fixed";

export function RevenueAttributionDetailPage() {
  const { id, mode } = useParams<{ id?: string; mode?: string }>();
  const navigate = useNavigate();
  const isNew = !id;
  const isEditMode = mode === "edit";
  const isApplyMode = mode === "apply";

  const attribution = useRouteRecord(useGetRevenueAttribution, id);
  const venues = useListVenue();
  const people = useListPerson();
  const referralSources = useListReferralSource();
  const clients = useListClient();
  const event = useGetEvent(
    isNew || !attribution?.eventId ? "skip" : attribution.eventId,
  );

  const create = useRevenueAttributionCreate();
  const apply = useRevenueAttributionApply();
  const update = useRevenueAttributionUpdate();

  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();

  // Form state
  const [attributionType, setAttributionType] =
    useState<AttributionType>("venue_commission");
  const [allocationMethod, setAllocationMethod] =
    useState<AllocationMethod>("percent");
  const [percentBasis, setPercentBasis] = useState(0);
  const [fixedAmount, setFixedAmount] = useState(0);
  const [venueId, setVenueId] = useState("");
  const [salespersonId, setSalespersonId] = useState("");
  const [referralSourceId, setReferralSourceId] = useState("");
  const [partnerPersonId, setPartnerPersonId] = useState("");
  const [partnerClientId, setPartnerClientId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [eventRevenue, setEventRevenue] = useState(0);
  const [eventRevenueBasis, setEventRevenueBasis] =
    useState("Operator entered");
  const initializedApplyContext = useRef<string | null>(null);

  // Load existing data when editing
  useEffect(() => {
    if (attribution && !isNew) {
      setAttributionType(attribution.attributionType as AttributionType);
      setAllocationMethod(attribution.allocationMethod as AllocationMethod);
      setPercentBasis(Number(attribution.percentBasis));
      setFixedAmount(Number(attribution.fixedAmount));
      setVenueId(attribution.venueId ?? "");
      setSalespersonId(attribution.salespersonId ?? "");
      setReferralSourceId(attribution.referralSourceId ?? "");
      setPartnerPersonId(attribution.partnerPersonId ?? "");
      setPartnerClientId(attribution.partnerClientId ?? "");
      setReason(attribution.reason ?? "");
      setNotes(attribution.notes ?? "");
    }
  }, [attribution, isNew]);

  // Set event revenue for apply mode
  useEffect(() => {
    const context = isApplyMode && attribution ? String(attribution._id) : null;
    if (event && context && initializedApplyContext.current !== context) {
      const estimate = eventRevenueEstimate(event);
      setEventRevenue(estimate.amount);
      setEventRevenueBasis(estimate.basis);
      initializedApplyContext.current = context;
    }
  }, [event, attribution, isApplyMode]);

  const calculatedAllocation = useMemo(() => {
    if (allocationMethod === "percent" && eventRevenue > 0) {
      return (eventRevenue * percentBasis) / 100;
    }
    return fixedAmount;
  }, [allocationMethod, percentBasis, fixedAmount, eventRevenue]);

  const activeVenues = (venues ?? []).filter((v) => v.deletedAt == null);
  const activePeople = (people ?? []).filter((p) => p.deletedAt == null);
  const activeReferralSources = (referralSources ?? []).filter(
    (s) => s.deletedAt == null,
  );
  const activeClients = (clients ?? []).filter((c) => c.deletedAt == null);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setFailure(null);
    setNotice(null);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isNew) {
      void run("create", async () => {
        // Note: the routed paths always carry an :id, so this create branch is
        // unreachable today — attributions are created from event detail pages.
        // If a standalone create route is ever added it must supply an eventId.
        await create({
          eventId: "",
          attributionType,
          allocationMethod,
          percentBasis: allocationMethod === "percent" ? percentBasis : 0,
          fixedAmount: allocationMethod === "fixed" ? fixedAmount : 0,
          venueId: venueId || undefined,
          salespersonId: salespersonId || undefined,
          referralSourceId: referralSourceId || undefined,
          partnerPersonId: partnerPersonId || undefined,
          partnerClientId: partnerClientId || undefined,
          reason: reason || undefined,
        });
        navigate("/finance/attribution");
        setNotice("Revenue attribution created.");
      });
    } else if (attribution && isEditMode) {
      void run("update", async () => {
        await update({
          docId: attribution._id,
          version: attribution.version,
          percentBasis: allocationMethod === "percent" ? percentBasis : 0,
          fixedAmount: allocationMethod === "fixed" ? fixedAmount : 0,
          reason: reason || undefined,
          notes: notes || undefined,
        });
        setNotice("Revenue attribution updated.");
      });
    }
  };

  const handleApply = () => {
    if (!attribution || eventRevenue <= 0) {
      setFailure(new Error("Enter a valid event revenue amount."));
      return;
    }
    void run("apply", async () => {
      await apply({
        docId: attribution._id,
        version: attribution.version,
        eventRevenue,
      });
      setNotice(`Attribution applied: ${usd(calculatedAllocation)} allocated.`);
      setTimeout(() => navigate("/finance/attribution"), 1500);
    });
  };

  const isVenueCommission = attributionType === "venue_commission";
  const isSalesCommission = attributionType === "sales_commission";
  const isReferralFee = attributionType === "referral_fee";
  const isPartnerSplit = attributionType === "partner_split";

  if (attribution === undefined && !isNew) {
    return (
      <div className="operations-stage supply-stage tax-stage">
        <FormSkeleton />
      </div>
    );
  }

  const existingEvent = event;
  const canEdit =
    isNew ||
    attribution?.status === "draft" ||
    attribution?.status === "rejected";
  const canApply = attribution?.status === "approved";

  return (
    <div className="operations-stage supply-stage tax-stage">
      <header className="supply-masthead tax-masthead">
        <div>
          <p className="eyebrow">Finance · Attribution desk</p>
          <h1 className="display-title mt-2">
            {isNew ? "Create revenue attribution" : "Revenue attribution"}
          </h1>
          {attribution && !isNew && existingEvent && (
            <p className="mt-3 max-w-160 text-ink-2">
              Event: {existingEvent.title} · Status:{" "}
              <StatusChip status={attribution.status} />
            </p>
          )}
        </div>
        <Link to="/finance/attribution" className="btn btn-secondary">
          Back to list
        </Link>
      </header>

      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {isApplyMode && attribution && existingEvent ? (
        <div className="tax-config-grid">
          <div className="supply-form">
            <div className="supply-form-heading">
              <div>
                <p className="eyebrow">Apply attribution</p>
                <h2>Calculate allocation</h2>
              </div>
            </div>
            <p className="text-ink-2">
              Enter the event revenue amount to calculate the allocation based
              on{" "}
              {attribution.allocationMethod === "percent"
                ? `${attribution.percentBasis}%`
                : usd(attribution.fixedAmount)}
              .
            </p>
            <label className="field-label">
              Event revenue
              <div className="tax-percent-input is-prefix">
                <span>$</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={eventRevenue || ""}
                  onChange={(e) => {
                    setEventRevenue(Number(e.target.value));
                    setEventRevenueBasis("Operator entered");
                  }}
                  placeholder="0.00"
                />
              </div>
              <small className="field-help">
                Prefilled from: {eventRevenueBasis}. Confirm or replace this
                estimate before applying.
              </small>
            </label>
            <div className="form-summary">
              <dl className="supply-detail-list">
                <div>
                  <dt>Allocation method</dt>
                  <dd>
                    {attribution.allocationMethod === "percent"
                      ? "Percent"
                      : "Fixed"}
                  </dd>
                </div>
                <div>
                  <dt>Basis</dt>
                  <dd>
                    {attribution.allocationMethod === "percent"
                      ? `${attribution.percentBasis}%`
                      : usd(attribution.fixedAmount)}
                  </dd>
                </div>
                <div>
                  <dt>Calculated allocation</dt>
                  <dd className="text-ok font-semibold">
                    {usd(calculatedAllocation)}
                  </dd>
                </div>
              </dl>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy != null || eventRevenue <= 0}
              onClick={handleApply}
            >
              {busy === "apply" ? "Applying…" : "Apply attribution"}
            </button>
          </div>
          <div className="tax-rate-register">
            <div className="ledger-heading">
              <div>
                <p className="eyebrow">Attribution details</p>
                <h2>{attributionTypeLabel(attribution.attributionType)}</h2>
              </div>
            </div>
            <dl className="supply-detail-list">
              <div>
                <dt>Type</dt>
                <dd>{attributionTypeLabel(attribution.attributionType)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>
                  {attribution.allocationMethod === "percent"
                    ? "Percent"
                    : "Fixed"}
                </dd>
              </div>
              <div>
                <dt>Requested</dt>
                <dd>{formatDate(attribution.requestedAt)}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusChip status={attribution.status} />
                </dd>
              </div>
              {attribution.approvedAt && (
                <div>
                  <dt>Approved</dt>
                  <dd>{formatDate(attribution.approvedAt)}</dd>
                </div>
              )}
              {attribution.reason && (
                <div>
                  <dt>Reason</dt>
                  <dd>{attribution.reason}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="supply-form">
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">
                {isNew ? "New attribution" : "Edit attribution"}
              </p>
              <h2>{attributionTypeLabel(attributionType)}</h2>
            </div>
          </div>

          <label className="field-label">
            Attribution type
            <select
              className="input"
              value={attributionType}
              onChange={(e) =>
                setAttributionType(e.target.value as AttributionType)
              }
              disabled={!canEdit}
            >
              <option value="venue_commission">Venue commission</option>
              <option value="sales_commission">Sales commission</option>
              <option value="referral_fee">Referral fee</option>
              <option value="partner_split">Partner split</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="field-label">
            Allocation method
            <select
              className="input"
              value={allocationMethod}
              onChange={(e) =>
                setAllocationMethod(e.target.value as AllocationMethod)
              }
              disabled={!canEdit}
            >
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </select>
          </label>

          {allocationMethod === "percent" ? (
            <label className="field-label">
              Percent basis
              <div className="tax-percent-input">
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={percentBasis || ""}
                  onChange={(e) => setPercentBasis(Number(e.target.value))}
                  disabled={!canEdit}
                  placeholder="15.00"
                />
                <span>%</span>
              </div>
            </label>
          ) : (
            <label className="field-label">
              Fixed amount
              <div className="tax-percent-input is-prefix">
                <span>$</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={fixedAmount || ""}
                  onChange={(e) => setFixedAmount(Number(e.target.value))}
                  disabled={!canEdit}
                  placeholder="0.00"
                />
              </div>
            </label>
          )}

          {isVenueCommission && (
            <label className="field-label">
              Venue
              <select
                className="input"
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Select venue…</option>
                {activeVenues
                  .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                  .map((venue) => (
                    <option key={venue._id} value={venue._id}>
                      {venue.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {isSalesCommission && (
            <label className="field-label">
              Salesperson
              <select
                className="input"
                value={salespersonId}
                onChange={(e) => setSalespersonId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Select salesperson…</option>
                {activePeople
                  .filter(
                    (p) =>
                      p.role === "sales_staff" ||
                      p.role === "sales_manager" ||
                      p.role === "owner",
                  )
                  .sort((a, b) =>
                    `${a.givenName} ${a.familyName}`.localeCompare(
                      `${b.givenName} ${b.familyName}`,
                    ),
                  )
                  .map((person) => (
                    <option key={person._id} value={person._id}>
                      {person.givenName} {person.familyName}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {isReferralFee && (
            <label className="field-label">
              Referral source
              <select
                className="input"
                value={referralSourceId}
                onChange={(e) => setReferralSourceId(e.target.value)}
                disabled={!canEdit}
              >
                <option value="">Select referral source…</option>
                {activeReferralSources
                  .sort((a, b) => String(a.name).localeCompare(String(b.name)))
                  .map((source) => (
                    <option key={source._id} value={source._id}>
                      {source.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {isPartnerSplit && (
            <>
              <label className="field-label">
                Partner person
                <select
                  className="input"
                  value={partnerPersonId}
                  onChange={(e) => setPartnerPersonId(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">Select person…</option>
                  {activePeople
                    .sort((a, b) =>
                      `${a.givenName} ${a.familyName}`.localeCompare(
                        `${b.givenName} ${b.familyName}`,
                      ),
                    )
                    .map((person) => (
                      <option key={person._id} value={person._id}>
                        {person.givenName} {person.familyName}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Partner client
                <select
                  className="input"
                  value={partnerClientId}
                  onChange={(e) => setPartnerClientId(e.target.value)}
                  disabled={!canEdit}
                >
                  <option value="">Select client…</option>
                  {activeClients
                    .sort((a, b) =>
                      String(a.companyName || a.displayName).localeCompare(
                        String(b.companyName || b.displayName),
                      ),
                    )
                    .map((client) => (
                      <option key={client._id} value={client._id}>
                        {client.companyName || client.displayName}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}

          <label className="field-label">
            Reason
            <input
              className="input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={!canEdit}
              placeholder="Why this attribution is being made…"
            />
          </label>

          {!isNew && (
            <label className="field-label">
              Notes
              <textarea
                className="input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit}
                placeholder="Additional context or approval notes…"
              />
            </label>
          )}

          {canEdit && (
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy != null}
            >
              {busy === "create" || busy === "update"
                ? "Saving…"
                : isNew
                  ? "Create attribution"
                  : "Save changes"}
            </button>
          )}

          {!canEdit && !isNew && attribution?.status === "rejected" && (
            <p className="text-ink-2">
              This attribution was rejected:{" "}
              <strong>{attribution.rejectionReason}</strong>
              <br />
              Create a new attribution to revise and resubmit.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
