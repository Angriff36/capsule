import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useListRevenueAttribution,
  useListEvent,
  useRevenueAttributionApprove,
  useRevenueAttributionReject,
  useRevenueAttributionRequestApproval,
  useRevenueAttributionUpdate,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  formatDate as formatDateShared,
  formatMoneyExact,
} from "../../lib/format";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";

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

export function RevenueAttributionsPage() {
  const attributions = useListRevenueAttribution();
  const events = useListEvent();
  const approve = useRevenueAttributionApprove();
  const reject = useRevenueAttributionReject();
  const requestApproval = useRevenueAttributionRequestApproval();
  const update = useRevenueAttributionUpdate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const configuredAttributions = (attributions ?? [])
    .filter((attr) => attr.deletedAt == null)
    .sort((a, b) => {
      // Sort by status first (pending_approval first), then date
      const statusOrder = {
        pending_approval: 0,
        draft: 1,
        approved: 2,
        applied: 3,
        rejected: 4,
      };
      const aStatus = statusOrder[a.status as keyof typeof statusOrder] ?? 99;
      const bStatus = statusOrder[b.status as keyof typeof statusOrder] ?? 99;
      if (aStatus !== bStatus) return aStatus - bStatus;
      return (
        new Date(b.requestedAt ?? 0).getTime() -
        new Date(a.requestedAt ?? 0).getTime()
      );
    });

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

  const handleRequestApproval = (attr: {
    _id: string;
    version: number;
    status: string;
  }) => {
    void run(`request:${attr._id}`, async () => {
      await requestApproval({
        docId: attr._id,
        version: attr.version,
      });
      setNotice("Attribution submitted for approval.");
    });
  };

  const handleApprove = (attr: {
    _id: string;
    version: number;
    status: string;
  }) => {
    void run(`approve:${attr._id}`, async () => {
      await approve({
        docId: attr._id,
        version: attr.version,
      });
      setNotice("Attribution approved.");
    });
  };

  const handleReject = () => {
    if (!rejectingId || !rejectionReason.trim()) {
      setFailure(new Error("Rejection reason is required."));
      return;
    }
    const attr = attributions?.find((a) => a._id === rejectingId);
    if (!attr) return;

    void run(`reject:${rejectingId}`, async () => {
      await reject({
        docId: rejectingId,
        version: attr.version,
        rejectionReason: rejectionReason.trim(),
      });
      setNotice("Attribution rejected.");
      setRejectingId(null);
      setRejectionReason("");
    });
  };

  const handleUpdateDraft = (
    attr: {
      _id: string;
      version: number;
      status: string;
    },
    updates: Record<string, unknown>,
  ) => {
    void run(`update:${attr._id}`, async () => {
      await update({
        docId: attr._id,
        version: attr.version,
        ...updates,
      });
      setNotice("Attribution updated.");
    });
  };

  if (attributions === undefined || events === undefined) {
    return (
      <div className="operations-stage supply-stage tax-stage">
        <TableSkeleton rows={7} />
      </div>
    );
  }

  return (
    <div className="operations-stage supply-stage tax-stage">
      <header className="supply-masthead tax-masthead">
        <div>
          <p className="eyebrow">Finance · Attribution desk</p>
          <h1 className="display-title mt-2">Revenue attribution</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Review and approve revenue splits to venues, salespeople, and
            partners. Attribution applies to event revenue after approval.
          </p>
        </div>
        <div className="tax-period-stamp" aria-label="Attribution status">
          <span>Pending approval</span>
          <strong>
            {
              configuredAttributions.filter(
                (a) => a.status === "pending_approval",
              ).length
            }
          </strong>
          <small>{configuredAttributions.length} total</small>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      {configuredAttributions.length === 0 ? (
        <div className="document-empty">
          <p>No revenue attributions yet.</p>
          <span>
            Create attributions from event detail pages to track commissions and
            splits.
          </span>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Event</th>
                <th>Type</th>
                <th>Method</th>
                <th>Basis</th>
                <th>Allocated</th>
                <th>Requested</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {configuredAttributions.map((attr) => {
                const event = events?.find((e) => e._id === attr.eventId);
                const isPending = attr.status === "pending_approval";
                const isDraft = attr.status === "draft";
                const canApprove = isPending;
                const canRequest = isDraft;

                return (
                  <tr key={attr._id}>
                    <td>
                      <StatusChip status={String(attr.status)} />
                    </td>
                    <td>
                      <Link
                        to={`/events/${attr.eventId}`}
                        className="text-link"
                      >
                        {event?.title ?? "Unknown event"}
                      </Link>
                      {attr.venueId ? (
                        <small className="text-ink-2 block">Venue split</small>
                      ) : null}
                    </td>
                    <td>{attributionTypeLabel(attr.attributionType)}</td>
                    <td>
                      {attr.allocationMethod === "percent" ? "%" : "Fixed"}
                    </td>
                    <td>
                      {attr.allocationMethod === "percent"
                        ? `${attr.percentBasis}%`
                        : usd(attr.fixedAmount)}
                    </td>
                    <td>
                      {attr.status === "applied" || attr.allocatedAmount > 0
                        ? usd(attr.allocatedAmount)
                        : "—"}
                    </td>
                    <td>
                      <small>{formatDate(attr.requestedAt)}</small>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {isDraft && (
                          <button
                            className="text-link"
                            disabled={busy != null}
                            onClick={() => handleRequestApproval(attr)}
                          >
                            Submit
                          </button>
                        )}
                        {canApprove && (
                          <button
                            className="text-link"
                            disabled={busy != null}
                            onClick={() => handleApprove(attr)}
                          >
                            Approve
                          </button>
                        )}
                        {isPending && (
                          <button
                            className="text-link text-ink-2"
                            disabled={busy != null}
                            onClick={() => setRejectingId(attr._id)}
                          >
                            Reject
                          </button>
                        )}
                        {isDraft && (
                          <Link
                            to={`/finance/attribution/${attr._id}/edit`}
                            className="text-link"
                          >
                            Edit
                          </Link>
                        )}
                        {attr.status === "approved" && (
                          <Link
                            to={`/finance/attribution/${attr._id}/apply`}
                            className="text-link"
                          >
                            Apply
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Rejection reason modal */}
      {rejectingId && (
        <div className="modal-overlay" onClick={() => setRejectingId(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <h2>Reject attribution</h2>
            <p className="text-ink-2">
              Explain why this attribution is being rejected. The submitter can
              revise and resubmit.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleReject();
              }}
            >
              <label>
                Rejection reason
                <textarea
                  required
                  rows={3}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain what needs to be corrected…"
                />
              </label>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectionReason("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={busy != null || !rejectionReason.trim()}
                >
                  {busy?.startsWith("reject:") ? "Rejecting…" : "Reject"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
