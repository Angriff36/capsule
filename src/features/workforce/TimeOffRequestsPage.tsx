import { useState } from "react";
import {
  useListPerson,
  useListTimeOffRequest,
  useTimeOffRequestApprove,
  useTimeOffRequestDecline,
} from "../../lib/manifest-convex-react";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

const dateRange = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const formatRange = (startsAt?: number | null, endsAt?: number | null) =>
  startsAt == null || endsAt == null
    ? "Dates unavailable"
    : `${dateRange.format(startsAt)} – ${dateRange.format(endsAt - 1)}`;

export function TimeOffRequestsPage() {
  const requests = useListTimeOffRequest();
  const people = useListPerson();
  const approve = useTimeOffRequestApprove();
  const decline = useTimeOffRequestDecline();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const personName = (personId: string) => {
    const person = people?.find((row) => row._id === personId);
    return person
      ? `${person.givenName} ${person.familyName}`.trim()
      : "Staff member";
  };
  const visible = (requests ?? [])
    .filter((request) => request.deletedAt == null)
    .sort(
      (left, right) =>
        (left.status === "pending" ? 0 : 1) -
          (right.status === "pending" ? 0 : 1) ||
        (right.submittedAt ?? 0) - (left.submittedAt ?? 0),
    );
  const pending = visible.filter((request) => request.status === "pending");
  const reviewed = visible.filter((request) => request.status !== "pending");

  const review = async (
    request: (typeof visible)[number],
    decision: "approve" | "decline",
  ) => {
    setFailure(null);
    setBusy(`${request._id}:${decision}`);
    try {
      const args = { docId: request._id, version: request.version };
      if (decision === "approve") await approve(args);
      else await decline(args);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Time off</p>
          <h1 className="display-title mt-2">Time-off review desk</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Review staff requests in one pass. Approval immediately protects the
            covered dates from new shift assignments.
          </p>
        </div>
        <div className="rounded-sm border border-brand/20 bg-brand-soft px-5 py-4 text-center">
          <p className="text-3xl leading-none font-semibold text-brand">
            {pending.length}
          </p>
          <p className="mt-1 text-xs font-medium tracking-wide text-ink-2 uppercase">
            Awaiting review
          </p>
        </div>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      <section className="working-ledger" data-testid="time-off-review-queue">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Needs a decision</p>
            <h2>Pending requests</h2>
          </div>
          <span className="text-sm text-ink-3">
            Oldest requests stay visible until reviewed
          </span>
        </div>
        {requests === undefined || people === undefined ? (
          <TableSkeleton rows={4} />
        ) : pending.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            hint="New staff requests will appear here and in notifications."
          />
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2">
            {pending.map((request) => (
              <article
                key={request._id}
                className="rounded-sm border border-line-2 bg-panel p-4 shadow-[0_10px_24px_-24px_rgba(34,30,22,0.7)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {personName(String(request.personId))}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-brand">
                      {formatRange(request.startsAt, request.endsAt)}
                    </p>
                  </div>
                  <StatusChip status="pending" />
                </div>
                <p className="mt-3 min-h-10 text-base leading-relaxed text-ink-2">
                  {request.reason}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy != null}
                    onClick={() => void review(request, "approve")}
                  >
                    {busy === `${request._id}:approve`
                      ? "Approving…"
                      : "Approve"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy != null}
                    onClick={() => void review(request, "decline")}
                  >
                    {busy === `${request._id}:decline` ? "Denying…" : "Deny"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Decision history</p>
              <h2>Recently reviewed</h2>
            </div>
          </div>
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Dates</th>
                  <th>Reason</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {reviewed.slice(0, 30).map((request) => (
                  <tr key={request._id}>
                    <td>{personName(String(request.personId))}</td>
                    <td>{formatRange(request.startsAt, request.endsAt)}</td>
                    <td>{request.reason}</td>
                    <td>
                      <StatusChip status={String(request.status)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
