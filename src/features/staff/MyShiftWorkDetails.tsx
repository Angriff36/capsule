import { formatTime } from "../../lib/format";

type ShiftRow = {
  personId?: string | null;
  startsAt?: number | null;
  eventStaffingSourceIds?: readonly string[] | null;
};
type AssignmentRow = {
  _id: string;
  version: number;
  personId: string;
  status: string;
  notes?: string | null;
};
type NeedRow = {
  _id: string;
  uniform?: string | null;
  workLocation?: string | null;
  description?: string | null;
};
type EventRow = { venueName?: string | null; venueAddress?: string | null };

export type ShiftWorkDetails = {
  /** When to arrive: the shift start, which follows the run this person travels with. */
  callTime: number | null;
  venue: string | null;
  wear: string[];
  notes: string[];
  /** An assignment still waiting for this person's "yes". */
  toConfirm: { docId: string; version: number } | null;
  confirmed: boolean;
};

/** What a worker needs to know about one upcoming event shift (AC-518). */
export function shiftWorkDetails(
  shift: ShiftRow,
  assignments: readonly AssignmentRow[],
  needs: readonly NeedRow[],
  event: EventRow | null,
): ShiftWorkDetails {
  const ids = new Set(shift.eventStaffingSourceIds ?? []);
  const mine = assignments.filter(
    (row) =>
      ids.has(row._id) &&
      row.personId === shift.personId &&
      row.status !== "unassigned",
  );
  const covered = needs.filter((row) => ids.has(row._id));
  const unique = (values: (string | null | undefined)[]) => [
    ...new Set(
      values.flatMap((value) => (value?.trim() ? [value.trim()] : [])),
    ),
  ];
  const waiting = mine.find((row) => row.status === "assigned");
  return {
    callTime: shift.startsAt ?? null,
    venue: event?.venueName?.trim() || event?.venueAddress?.trim() || null,
    wear: unique(covered.map((row) => row.uniform)),
    notes: unique([
      ...covered.map((row) => row.workLocation && `At ${row.workLocation}`),
      ...covered.map((row) => row.description),
      ...mine.map((row) => row.notes),
    ]),
    toConfirm: waiting
      ? { docId: waiting._id, version: waiting.version }
      : null,
    confirmed: mine.length > 0 && !waiting,
  };
}

/** Call time, venue, what to wear, notes and the confirm button for one shift. */
export function MyShiftWorkDetails({
  details,
  busy,
  onConfirm,
}: {
  details: ShiftWorkDetails;
  busy: boolean;
  onConfirm: (target: { docId: string; version: number }) => void;
}) {
  const facts = [
    details.callTime != null
      ? `Call time ${formatTime(details.callTime)}`
      : null,
    details.venue,
    details.wear.length ? `Wear: ${details.wear.join("; ")}` : null,
    ...details.notes,
  ].filter(Boolean);
  if (!facts.length && !details.toConfirm && !details.confirmed) return null;
  return (
    <div
      className="mt-1 text-sm text-ink-2"
      data-testid="my-shift-work-details"
    >
      {facts.length ? <p>{facts.join(" · ")}</p> : null}
      {details.toConfirm ? (
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-medium text-warn">
            Please confirm you can work this
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => onConfirm(details.toConfirm!)}
          >
            Confirm
          </button>
        </p>
      ) : details.confirmed ? (
        <p className="mt-1 font-medium text-ok">You confirmed this shift</p>
      ) : null}
    </div>
  );
}
