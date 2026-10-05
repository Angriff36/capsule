import { useMemo, useState } from "react";
import type { Id } from "../../lib/api";
import { useListShift } from "../../lib/manifest-convex-react";
import { useEventsById } from "../facilities/useEventsById";
import {
  useApplyShiftTimingChange,
  useEventShiftChanges,
  useKeepShiftTime,
} from "../../lib/useEventTimingRules";
import {
  buildStaffShiftSummary,
  shiftsInScheduleWeek,
  startOfScheduleWeek,
} from "../workforce/weeklySchedule";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { timeLabel } from "./EventTimingPlannerDraft";

const shiftTimeLabel = (times: {
  startsAt: number | null;
  endsAt: number | null;
}) =>
  times.startsAt == null
    ? "no time yet"
    : `${timeLabel(times.startsAt)}${times.endsAt != null ? ` – ${timeLabel(times.endsAt)}` : ""}`;

/**
 * Shift times the event plan wants to move for people whose week was
 * already sent to them (spec §8.4, PL-TIMING). Nothing moves until a manager
 * sends the change; sending publishes the person's week again so they see
 * the new time and confirm it.
 */
export function EventShiftChangesPanel({ eventId }: { eventId: string }) {
  const changes = useEventShiftChanges(eventId as Id<"events">);
  const shifts = useListShift();
  const eventIds = useMemo(
    () =>
      shifts === undefined
        ? undefined
        : [eventId, ...shifts.map((row) => row.eventId)],
    [eventId, shifts],
  );
  const events = useEventsById(eventIds);
  const apply = useApplyShiftTimingChange();
  const keep = useKeepShiftTime();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  if (!changes || changes.length === 0) return null;

  const eventName = (id: string | undefined) =>
    events?.find((row) => row._id === id)?.title ?? "—";

  /** The person's week as they will see it after the change. */
  const summaryFor = (change: (typeof changes)[number]) => {
    const anchor = change.to.startsAt ?? change.from.startsAt ?? Date.now();
    const moved = (shifts ?? [])
      .filter(
        (row) => row.personId === change.personId && row.deletedAt == null,
      )
      .map((row) =>
        row._id === change.shiftId
          ? { ...row, startsAt: change.to.startsAt, endsAt: change.to.endsAt }
          : row,
      );
    const week = shiftsInScheduleWeek(moved, startOfScheduleWeek(anchor));
    return (
      buildStaffShiftSummary(week, eventName) ||
      `${change.role} · ${shiftTimeLabel(change.to)}`
    );
  };

  const act = async (id: string, work: () => Promise<unknown>) => {
    setBusy(id);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      className="card border-warn/30 bg-warn-soft p-4"
      aria-label="Shift time changes to send"
    >
      <h3 className="text-base font-semibold">Shift time changes to send</h3>
      <p className="mt-1 text-base text-ink-2">
        The event plan changed, but these people already have their week. Their
        shifts stay as they are until you send the new time.
      </p>
      {failure && (
        <div className="mt-3">
          <FailureBanner failure={failure} />
        </div>
      )}
      <ul className="mt-3 divide-y divide-line">
        {changes.map((change) => (
          <li
            key={change.proposalId}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-base font-semibold">
                {change.personName} · {change.role}
              </p>
              <p className="text-base">
                Now {shiftTimeLabel(change.from)} → new{" "}
                {shiftTimeLabel(change.to)}
              </p>
              <p className="text-sm text-ink-2">
                {change.acknowledged
                  ? "They confirmed their week. Sending asks them to confirm again."
                  : "Their week was sent but not confirmed yet."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary min-h-10"
                disabled={busy != null}
                onClick={() =>
                  void act(change.proposalId, () =>
                    apply({
                      proposalId: change.proposalId,
                      shiftSummary: summaryFor(change),
                    }),
                  )
                }
              >
                {busy === change.proposalId ? "Sending…" : "Send new time"}
              </button>
              <button
                type="button"
                className="btn btn-ghost min-h-10"
                disabled={busy != null}
                onClick={() =>
                  void act(change.proposalId, () =>
                    keep({ proposalId: change.proposalId }),
                  )
                }
              >
                Keep current time
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
