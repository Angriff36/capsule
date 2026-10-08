import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useRevenueAttributionApprove,
  useRevenueAttributionReject,
  useRevenueAttributionRequestApproval,
  useRevenueAttributionUpdate,
} from "../../lib/manifest-convex-react";
import { useEventsById, useEventsInRange } from "../facilities/useEventsById";
import {
  useAttributionsForEvents,
  usePagedRows,
  useRowsWithEmpty,
} from "../../lib/financeScopedQueries";
import { useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  formatDate as formatDateShared,
  formatMoneyExact,
} from "../../lib/format";
import { FinanceFailureBanner } from "./FinanceFailureBanner";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import {
  monthRange,
  monthValue,
  RevenueSplitSummary,
} from "./RevenueSplitSummary";
// This page renders tax-workspace surfaces (tax-period-stamp). Routes are lazy
// chunks, so landing directly on this page without this import gets no styles
// and the header stat runs together ("Pending approval00 total").
import "./taxWorkspace.css";
import { useActionNotice } from "../../ui/action-result";

const usd = formatMoneyExact;
// A split not yet applied (draft, pending, approved, rejected) has no applied
// date; applied ones always have one.
const NOT_APPLIED = ["appliedAt"];

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
  // The table shows every split not yet applied (through the applied-date
  // index) and the newest applied ones a page at a time; the summary reads
  // only the picked month's events and their splits.
  const openAttributions = useRowsWithEmpty("revenueAttributions", NOT_APPLIED);
  const attributionPages = usePagedRows("revenueAttributions");
  const attributions =
    openAttributions === undefined || attributionPages.rows === undefined
      ? undefined
      : [
          ...new Map(
            [...openAttributions, ...attributionPages.rows].map((row) => [
              row._id,
              row,
            ]),
          ).values(),
        ];
  const events = useEventsById(
    attributions === undefined
      ? undefined
      : attributions.map((attr) => String(attr.eventId)),
  );
  const [month, setMonth] = useState(() => monthValue(new Date()));
  const [monthFrom, monthTo] = monthRange(month);
  const monthEvents = useEventsInRange({ from: monthFrom, to: monthTo });
  const monthSplits = useAttributionsForEvents(
    monthEvents?.map((event) => event._id),
  );
  const approve = useRevenueAttributionApprove();
  const reject = useRevenueAttributionReject();
  const requestApproval = useRevenueAttributionRequestApproval();
  const update = useRevenueAttributionUpdate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();
  const { prompt, host } = useActionPrompt(busy != null);

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

  const handleReject = (attr: { _id: string; version: number }) => {
    void (async () => {
      const reason = await prompt.askReason({
        title: "Reject attribution",
        description:
          "Explain why this attribution is being rejected. The submitter can revise and resubmit.",
        label: "Rejection reason",
        placeholder: "Explain what needs to be corrected…",
        confirmLabel: "Reject",
        tone: "danger",
      });
      if (!reason) return;
      void run(`reject:${attr._id}`, async () => {
        await reject({
          docId: attr._id,
          version: attr.version,
          rejectionReason: reason,
        });
        setNotice("Attribution rejected.");
      });
    })();
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
          <Link to="/finance/attribution/new" className="btn btn-primary mt-3">
            Add revenue split
          </Link>
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
          <small>
            {`${configuredAttributions.filter((a) => a.appliedAt == null).length} open · ${configuredAttributions.filter((a) => a.appliedAt != null).length} applied shown`}
          </small>
        </div>
      </header>
      <FinanceWorkspaceNav />
      {failure ? <FinanceFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}
      {host}

      <RevenueSplitSummary
        events={(monthEvents ?? []).map((event) => ({
          ...event,
          _id: String(event._id),
        }))}
        splits={(monthSplits ?? [])
          .filter((attr) => attr.deletedAt == null)
          .map((attr) => ({
            ...attr,
            eventId: String(attr.eventId),
          }))}
        onMonthChange={setMonth}
      />

      {configuredAttributions.length === 0 ? (
        <div className="document-empty">
          <p>No revenue attributions yet.</p>
          <span>
            Use Add revenue split to track a venue commission, a sales
            commission or a partner split for an event.
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
                            onClick={() => handleReject(attr)}
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
      {attributionPages.canLoadMore ? (
        <div className="px-4 py-3">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={attributionPages.loadingMore}
            onClick={attributionPages.loadMore}
          >
            {attributionPages.loadingMore ? "Loading…" : "Load older splits"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
