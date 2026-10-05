type Person = {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
};

export type WaitlistEntryRow = {
  _id: string;
  version: number;
  staffNeedId: string;
  personId: string;
  status: string;
  joinedAt?: number | null;
  deletedAt?: number | null;
};

/** Everything the waiting list needs from the screen that loads it. */
export type StaffNeedWaitlistControls = {
  entries: readonly WaitlistEntryRow[];
  busy: boolean;
  onJoin: (needId: string, personId: string) => void;
  onLeave: (entry: WaitlistEntryRow) => void;
};

/** Who waits for this taken shift, in order (AC-507); "" when nobody. */
export function waitlistLine(
  entries: readonly WaitlistEntryRow[],
  needId: string,
  people: readonly Person[],
): string {
  const names = entries
    .filter(
      (row) =>
        row.staffNeedId === needId &&
        row.status === "waiting" &&
        row.deletedAt == null,
    )
    .sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0))
    .map((row) => {
      const person = people.find((item) => item._id === row.personId);
      return person
        ? `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim()
        : "Someone";
    });
  return names.length ? `Waiting list: ${names.join(", ")}` : "";
}

/**
 * Waiting list for one shift: shows who is waiting; crew can join while the
 * shift is taken and leave any time. When the spot opens, the first person
 * waiting is named so they (or a manager) can take it.
 */
export function StaffNeedWaitlist({
  need,
  people,
  currentPersonId,
  controls,
}: {
  need: {
    _id: string;
    status?: string | null;
    claimedByPersonId?: string | null;
    filledByPersonId?: string | null;
  };
  people: readonly Person[];
  currentPersonId: string | null;
  controls: StaffNeedWaitlistControls;
}) {
  const line = waitlistLine(controls.entries, need._id, people);
  const mine = controls.entries.find(
    (row) =>
      row.staffNeedId === need._id &&
      row.personId === currentPersonId &&
      row.status === "waiting" &&
      row.deletedAt == null,
  );
  const taken = need.status === "claimed" || need.status === "filled";
  const holder =
    currentPersonId != null &&
    (need.claimedByPersonId === currentPersonId ||
      need.filledByPersonId === currentPersonId);
  const canJoin = currentPersonId != null && taken && !holder && !mine;
  if (!line && !canJoin && !mine) return null;
  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-2"
      data-testid="staff-need-waitlist"
    >
      {line ? <span>{line}</span> : null}
      {mine ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={controls.busy}
          onClick={() => controls.onLeave(mine)}
        >
          Leave waiting list
        </button>
      ) : canJoin ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={controls.busy}
          onClick={() => controls.onJoin(need._id, currentPersonId!)}
        >
          Join waiting list
        </button>
      ) : null}
    </div>
  );
}
