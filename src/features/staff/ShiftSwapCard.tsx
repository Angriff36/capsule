import { useState, type FormEvent } from "react";
import {
  useCreateShiftSwapRequest,
  useListPerson,
  useListQualification,
  useListShift,
  useListShiftSwapRequest,
  useListShiftType,
  useListTimeOffRequest,
  useListTrainingCompletion,
  useShiftSwapRequestAccept,
  useShiftSwapRequestDecline,
  useShiftSwapRequestWithdraw,
} from "../../lib/manifest-convex-react";
import { EmptyState, StatusChip } from "../../ui/primitives";
import { WorkforceFailureBanner } from "../workforce/WorkforceFailureBanner";
import { evaluateShiftSwapCandidate } from "../workforce/shiftSwapEligibility";

type ShiftSwapCardProps = {
  person: Record<string, any>;
};

const dateTime = new Intl.DateTimeFormat([], {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const statusLabel = (status: string) =>
  ({
    pending_recipient: "Coworker review",
    awaiting_manager: "Manager review",
    approved: "Approved",
    declined: "Declined",
    withdrawn: "Withdrawn",
    rejected: "Not approved",
  })[status] ?? status;

export function ShiftSwapCard({ person }: ShiftSwapCardProps) {
  const people = useListPerson();
  const shifts = useListShift();
  const requests = useListShiftSwapRequest();
  const qualifications = useListQualification();
  const trainingCompletions = useListTrainingCompletion();
  const shiftTypes = useListShiftType();
  const timeOffRequests = useListTimeOffRequest();
  const propose = useCreateShiftSwapRequest();
  const accept = useShiftSwapRequestAccept();
  const decline = useShiftSwapRequestDecline();
  const withdraw = useShiftSwapRequestWithdraw();
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const activeRows = (requests ?? []).filter((row) => row.deletedAt == null);
  const myScheduledShifts = (shifts ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        row.status === "scheduled" &&
        row.startsAt > Date.now() &&
        String(row.personId) === String(person._id),
    )
    .sort((left, right) => left.startsAt - right.startsAt);
  const incoming = activeRows.filter(
    (row) =>
      String(row.recipientPersonId) === String(person._id) &&
      row.status === "pending_recipient",
  );
  const outgoing = activeRows
    .filter((row) => String(row.requesterPersonId) === String(person._id))
    .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));

  const personName = (personId: string) => {
    const row = people?.find((item) => String(item._id) === personId);
    return row ? `${row.givenName} ${row.familyName}` : "Staff member";
  };
  const shiftFor = (shiftId: string) =>
    shifts?.find((row) => String(row._id) === shiftId);
  const run = (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    void work()
      .catch(setFailure)
      .finally(() => setBusy(null));
  };

  const submitProposal = (
    event: FormEvent<HTMLFormElement>,
    shift: Record<string, any>,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const recipientPersonId = String(data.get("recipientPersonId") || "");
    const recipient = people?.find(
      (row) => String(row._id) === recipientPersonId,
    );
    if (!recipient) return;
    const eligibility = evaluateShiftSwapCandidate({
      candidate: recipient,
      shift,
      shifts: shifts ?? [],
      timeOffRequests: timeOffRequests ?? [],
      qualifications: qualifications ?? [],
      trainingCompletions: trainingCompletions ?? [],
      shiftTypes: shiftTypes ?? [],
    });
    if (!eligibility.eligible) {
      setFailure(new Error(eligibility.reasons.join(" ")));
      return;
    }
    run(`propose:${shift._id}`, async () => {
      await propose({
        shiftId: shift._id,
        requesterPersonId: person._id,
        recipientPersonId,
        shiftTypeId: shift.shiftTypeId ?? undefined,
        sourceQualificationId: shift.requiredQualificationId ?? undefined,
        targetQualificationId: eligibility.targetQualificationId,
        targetTrainingCompletionId: eligibility.targetTrainingCompletionId,
        reason: String(data.get("reason") || "").trim() || undefined,
      });
      setOpenShiftId(null);
    });
  };

  const linked = person.authSubjectId != null;
  const activePeople = (people ?? []).filter(
    (row) => row.deletedAt == null && row.status === "active",
  );

  return (
    <section className="card px-4 py-4" data-testid="shift-swap-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Shift swaps</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-3">
            You confirm first, your coworker accepts, then a manager makes the
            assignment change.
          </p>
        </div>
        <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
          3-step check
        </span>
      </div>

      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {incoming.length > 0 ? (
        <div className="mt-4 space-y-3" data-testid="incoming-shift-swaps">
          <p className="text-sm font-semibold uppercase tracking-wide text-ink-3">
            Waiting for you
          </p>
          {incoming.map((request) => {
            const shift = shiftFor(String(request.shiftId));
            return (
              <article
                key={request._id}
                className="rounded-sm border border-brand/20 bg-brand-soft/40 p-3"
              >
                <p className="text-lg font-semibold">
                  {personName(String(request.requesterPersonId))}
                </p>
                <p className="mt-0.5 text-sm text-ink-2">
                  {shift?.startsAt
                    ? dateTime.format(shift.startsAt)
                    : "Shift unavailable"}
                  {shift?.role ? ` · ${shift.role}` : ""}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    className="btn btn-primary btn-sm flex-1"
                    disabled={busy != null || !linked}
                    onClick={() =>
                      run(`accept:${request._id}`, () =>
                        accept({
                          docId: request._id,
                          version: request.version,
                        }),
                      )
                    }
                  >
                    Accept swap
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null || !linked}
                    onClick={() =>
                      run(`decline:${request._id}`, () =>
                        decline({
                          docId: request._id,
                          version: request.version,
                        }),
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-3">
          Your upcoming shifts
        </p>
        {myScheduledShifts.length === 0 ? (
          <EmptyState
            title="No future shifts to swap"
            hint="Upcoming scheduled shifts appear here once they are assigned."
          />
        ) : (
          myScheduledShifts.map((shift) => {
            const existing = outgoing.find(
              (request) =>
                String(request.shiftId) === String(shift._id) &&
                ["pending_recipient", "awaiting_manager"].includes(
                  String(request.status),
                ),
            );
            const candidates = activePeople
              .map((candidate) => ({
                candidate,
                eligibility: evaluateShiftSwapCandidate({
                  candidate,
                  shift,
                  shifts: shifts ?? [],
                  timeOffRequests: timeOffRequests ?? [],
                  qualifications: qualifications ?? [],
                  trainingCompletions: trainingCompletions ?? [],
                  shiftTypes: shiftTypes ?? [],
                }),
              }))
              .filter((item) => item.eligibility.eligible);
            return (
              <article
                key={shift._id}
                className="rounded-sm border border-line-2 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold">
                      {dateTime.format(shift.startsAt)}
                    </p>
                    <p className="text-sm text-ink-2">
                      {shift.role || "Scheduled shift"}
                    </p>
                  </div>
                  {existing ? (
                    <StatusChip
                      status={String(existing.status)}
                      label={statusLabel(String(existing.status))}
                    />
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null || !linked}
                      onClick={() =>
                        setOpenShiftId((value) =>
                          value === shift._id ? null : shift._id,
                        )
                      }
                    >
                      Request swap
                    </button>
                  )}
                </div>

                {existing ? (
                  <div className="mt-3 flex items-center justify-between border-t border-line-2 pt-3">
                    <p className="text-sm text-ink-3">
                      You → {personName(String(existing.recipientPersonId))} →
                      manager
                    </p>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null || !linked}
                      onClick={() =>
                        run(`withdraw:${existing._id}`, () =>
                          withdraw({
                            docId: existing._id,
                            version: existing.version,
                          }),
                        )
                      }
                    >
                      Withdraw
                    </button>
                  </div>
                ) : null}

                {openShiftId === shift._id ? (
                  <form
                    className="mt-3 space-y-3 border-t border-line-2 pt-3"
                    onSubmit={(event) => submitProposal(event, shift)}
                  >
                    <label className="field-label">
                      Coworker
                      <select
                        name="recipientPersonId"
                        className="input"
                        required
                      >
                        <option value="">Choose eligible staff</option>
                        {candidates.map(({ candidate }) => (
                          <option key={candidate._id} value={candidate._id}>
                            {candidate.givenName} {candidate.familyName}
                          </option>
                        ))}
                      </select>
                    </label>
                    {candidates.length === 0 ? (
                      <p className="text-sm text-ink-3">
                        No linked staff are free and credentialed for this time.
                      </p>
                    ) : null}
                    <label className="field-label">
                      Note <span className="text-ink-3">(optional)</span>
                      <input
                        name="reason"
                        className="input"
                        placeholder="Why you need the swap"
                      />
                    </label>
                    <button
                      className="btn btn-primary w-full"
                      disabled={busy != null || candidates.length === 0}
                    >
                      Confirm and send
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {!linked ? (
        <p className="mt-3 rounded-sm bg-warn-soft px-3 py-2 text-sm text-ink-2">
          Ask a manager to link this staff profile to your sign-in before using
          shift swaps.
        </p>
      ) : null}
    </section>
  );
}
