import { useState } from "react";
import {
  useListPerson,
  useListQualification,
  useListShift,
  useListShiftSwapRequest,
  useListShiftType,
  useListTimeOffRequest,
  useListTrainingCompletion,
  useShiftSwapRequestApprove,
  useShiftSwapRequestReject,
} from "../../lib/manifest-convex-react";
import { PageHeader, StatusChip, TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { evaluateShiftSwapCandidate } from "./shiftSwapEligibility";
import "./ShiftSwapRequestsPage.css";

const dateTime = new Intl.DateTimeFormat([], {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function ShiftSwapRequestsPage() {
  const requests = useListShiftSwapRequest();
  const shifts = useListShift();
  const people = useListPerson();
  const qualifications = useListQualification();
  const trainingCompletions = useListTrainingCompletion();
  const shiftTypes = useListShiftType();
  const timeOffRequests = useListTimeOffRequest();
  const approve = useShiftSwapRequestApprove();
  const reject = useShiftSwapRequestReject();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const loading =
    requests === undefined ||
    shifts === undefined ||
    people === undefined ||
    qualifications === undefined ||
    trainingCompletions === undefined ||
    shiftTypes === undefined ||
    timeOffRequests === undefined;
  const pending = (requests ?? [])
    .filter((row) => row.deletedAt == null && row.status === "awaiting_manager")
    .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0));
  const history = (requests ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        ["approved", "rejected", "declined", "withdrawn"].includes(
          String(row.status),
        ),
    )
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));

  const personName = (id: string) => {
    const row = people?.find((person) => String(person._id) === id);
    return row ? `${row.givenName} ${row.familyName}` : "Unknown staff";
  };
  const run = (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    void work()
      .catch(setFailure)
      .finally(() => setBusy(null));
  };

  return (
    <div className="operations-stage supply-stage">
      <PageHeader
        title="Shift swap approvals"
        lead="Review swaps only after both staff members agree. Approval moves the scheduled shift to its new owner in the same transaction."
        actions={
          <div className="rounded-sm border border-brand/20 bg-brand-soft px-5 py-4 text-center">
            <p className="text-3xl leading-none font-semibold text-brand">
              {pending.length}
            </p>
            <p className="mt-1 text-xs font-medium tracking-wide text-ink-2 uppercase">
              Ready for review
            </p>
          </div>
        }
      />

      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      <section className="working-ledger" data-testid="shift-swap-approvals">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Both staff confirmed</p>
            <h2>Manager queue</h2>
          </div>
          <span>{pending.length} requests</span>
        </div>

        {loading ? (
          <TableSkeleton rows={4} />
        ) : pending.length === 0 ? (
          <div className="document-empty">
            <p>No shift swaps need approval.</p>
            <span>Accepted requests will appear here automatically.</span>
          </div>
        ) : (
          <div className="swap-approval-list">
            {pending.map((request) => {
              const shift = shifts?.find(
                (row) => String(row._id) === String(request.shiftId),
              );
              const candidate = people?.find(
                (row) => String(row._id) === String(request.recipientPersonId),
              );
              const eligibility =
                shift && candidate
                  ? evaluateShiftSwapCandidate({
                      candidate,
                      shift,
                      shifts: shifts ?? [],
                      timeOffRequests: timeOffRequests ?? [],
                      qualifications: qualifications ?? [],
                      trainingCompletions: trainingCompletions ?? [],
                      shiftTypes: shiftTypes ?? [],
                    })
                  : {
                      eligible: false,
                      reasons: ["Shift or recipient is unavailable."],
                    };
              return (
                <article className="swap-approval-card" key={request._id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="eyebrow">Scheduled shift</p>
                      <h3>
                        {shift?.startsAt
                          ? dateTime.format(shift.startsAt)
                          : "Shift unavailable"}
                      </h3>
                      <p className="mt-1 text-xs text-ink-2">
                        {shift?.role || "Scheduled shift"}
                      </p>
                    </div>
                    <StatusChip status="awaiting manager" />
                  </div>

                  <div className="swap-approval-route">
                    <div className="swap-approval-person">
                      <small>Requester ✓</small>
                      <strong>
                        {personName(String(request.requesterPersonId))}
                      </strong>
                    </div>
                    <span className="swap-approval-arrow">→</span>
                    <div className="swap-approval-person">
                      <small>Recipient ✓</small>
                      <strong>
                        {personName(String(request.recipientPersonId))}
                      </strong>
                    </div>
                    <span className="swap-approval-arrow">→</span>
                    <div className="swap-approval-person">
                      <small>Manager</small>
                      <strong>Final approval</strong>
                    </div>
                  </div>

                  {!eligibility.eligible ? (
                    <div className="swap-eligibility-note" role="status">
                      <strong>Review before approval:</strong>{" "}
                      {eligibility.reasons.join(" ")}
                    </div>
                  ) : null}

                  <div className="swap-approval-actions">
                    <button
                      className="btn btn-ghost"
                      disabled={busy != null}
                      onClick={() =>
                        run(`reject:${request._id}`, () =>
                          reject({
                            docId: request._id,
                            version: request.version,
                          }),
                        )
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="btn btn-primary"
                      data-testid={`approve-swap-${request._id}`}
                      disabled={busy != null || !eligibility.eligible}
                      onClick={() =>
                        run(`approve:${request._id}`, () =>
                          approve({
                            docId: request._id,
                            version: request.version,
                          }),
                        )
                      }
                    >
                      {busy === `approve:${request._id}`
                        ? "Approving…"
                        : "Approve swap"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {history.length > 0 ? (
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Recent decisions</p>
              <h2>Swap history</h2>
            </div>
            <span>{history.length} requests</span>
          </div>
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Shift</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((request) => {
                  const shift = shifts?.find(
                    (row) => String(row._id) === String(request.shiftId),
                  );
                  return (
                    <tr key={request._id}>
                      <td>
                        {shift?.startsAt
                          ? dateTime.format(shift.startsAt)
                          : "Unavailable"}
                      </td>
                      <td>{personName(String(request.requesterPersonId))}</td>
                      <td>{personName(String(request.recipientPersonId))}</td>
                      <td>
                        <StatusChip status={String(request.status)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
