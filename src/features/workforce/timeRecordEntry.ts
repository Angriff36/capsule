/**
 * Staff › Time primary clock-in/out contract (issue #149).
 *
 * TimeRecord already has eventId + clockInAt/clockOutAt on the Manifest.
 * Create goes through TimeRecord.clockIn (stamps now) and clockOut stamps
 * now; correct is the only generated command that writes arbitrary times.
 * This seam lets the Timesheet primary form collect an event and a real
 * window, then persist them without sending the user through Correct.
 */

export type ShiftLike = {
  _id: string;
  personId?: unknown;
  status?: unknown;
  deletedAt?: unknown;
  startsAt?: number | null;
  endsAt?: number | null;
  eventId?: string | null;
};

export type ClockInCreateArgs = {
  personId: string;
  shiftId?: string;
  eventId?: string;
  notes?: string;
};

export type TimeWindow = {
  clockInAt: number;
  clockOutAt: number;
};

export type TimeRecordWriteApi = {
  clockIn: (args: ClockInCreateArgs) => Promise<{ docId: string }>;
  clockOut: (args: {
    docId: string;
    version?: number;
  }) => Promise<{ version?: number } | void>;
  correct: (args: {
    docId: string;
    version?: number;
    clockInAt: number;
    clockOutAt: number;
  }) => Promise<unknown>;
};

const SHIFT_SLACK_MS = 2 * 60 * 60 * 1000;

export function toEpoch(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Best current shift for a person — same ±2h window Timesheet already used. */
export function currentShiftFor(
  personId: string,
  shifts: readonly ShiftLike[] | undefined,
  now = Date.now(),
): ShiftLike | undefined {
  return (shifts ?? [])
    .filter(
      (shift) =>
        shift.deletedAt == null &&
        String(shift.personId) === personId &&
        ["scheduled", "started"].includes(String(shift.status)),
    )
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
    .find(
      (shift) =>
        shift.startsAt != null &&
        shift.endsAt != null &&
        now >= shift.startsAt - SHIFT_SLACK_MS &&
        now <= shift.endsAt + SHIFT_SLACK_MS,
    );
}

/** Explicit event wins; otherwise inherit the current shift's event. */
export function resolveTimeRecordEventId(
  explicitEventId: string | null | undefined,
  shift: ShiftLike | undefined,
): string | undefined {
  const explicit = String(explicitEventId ?? "").trim();
  if (explicit) return explicit;
  const inherited = String(shift?.eventId ?? "").trim();
  return inherited || undefined;
}

export function buildClockInCreateArgs(input: {
  personId: string;
  eventId?: string | null;
  notes?: string | null;
  shift?: ShiftLike;
}): ClockInCreateArgs {
  const eventId = resolveTimeRecordEventId(input.eventId, input.shift);
  const notes = String(input.notes ?? "").trim();
  return {
    personId: input.personId,
    ...(input.shift ? { shiftId: input.shift._id } : {}),
    ...(eventId ? { eventId } : {}),
    ...(notes ? { notes } : {}),
  };
}

export function parseTimeWindow(
  clockInAt: unknown,
  clockOutAt: unknown,
): TimeWindow | null {
  const inAt = toEpoch(clockInAt);
  const outAt = toEpoch(clockOutAt);
  if (inAt == null || outAt == null || outAt < inAt) return null;
  return { clockInAt: inAt, clockOutAt: outAt };
}

export function clockOutFilled(value: unknown): boolean {
  return String(value ?? "").trim() !== "";
}

/**
 * Persist a Timesheet clock-in. Always forwards eventId (when chosen or
 * inherited). A finished window (both datetimes) clock-ins, clocks out, then
 * applies the entered times so 5:00–10:00 PM does not require the Correct
 * button. Clock-in-now leaves the record open at now().
 *
 * Landing status is still "corrected" — correct() is the only generated
 * command that writes arbitrary times, and it always mutates status. We do
 * not invent a closed-window command (Builder-owned mutations / Zod). STATE
 * paint treats that first write as attendance, not a user Correct.
 */
export async function persistPrimaryTimeRecord(
  api: TimeRecordWriteApi,
  input: {
    personId: string;
    eventId?: string | null;
    notes?: string | null;
    shift?: ShiftLike;
    clockInAt?: unknown;
    clockOutAt?: unknown;
    stampNow?: boolean;
  },
): Promise<{ docId: string; eventId?: string; window: TimeWindow | null }> {
  const createArgs = buildClockInCreateArgs(input);
  const created = await api.clockIn(createArgs);
  const wantsWindow = !input.stampNow && clockOutFilled(input.clockOutAt);
  const window = wantsWindow
    ? parseTimeWindow(input.clockInAt, input.clockOutAt)
    : null;
  if (wantsWindow && window == null) {
    throw new Error("Clock-out must be at or after clock-in.");
  }
  if (window) {
    const closed = await api.clockOut({
      docId: created.docId,
      version: 1,
    });
    await api.correct({
      docId: created.docId,
      ...(closed && closed.version != null ? { version: closed.version } : {}),
      clockInAt: window.clockInAt,
      clockOutAt: window.clockOutAt,
    });
  }
  return {
    docId: created.docId,
    eventId: createArgs.eventId,
    window,
  };
}

/**
 * Clock out an open record. The prompted datetime is applied via correct so
 * the primary Clock out action can close at a real time, not only now().
 */
export async function persistClockOut(
  api: Pick<TimeRecordWriteApi, "clockOut" | "correct">,
  input: {
    docId: string;
    version?: number;
    existingClockInAt: number;
    clockOutAt?: unknown;
  },
): Promise<void> {
  const closed = await api.clockOut({
    docId: input.docId,
    version: input.version,
  });
  const desiredOut = toEpoch(input.clockOutAt);
  if (desiredOut == null) return;
  if (desiredOut < input.existingClockInAt) {
    throw new Error("Clock-out must be at or after clock-in.");
  }
  await api.correct({
    docId: input.docId,
    ...(closed && closed.version != null ? { version: closed.version } : {}),
    clockInAt: input.existingClockInAt,
    clockOutAt: desiredOut,
  });
}

/**
 * Hidden persistPrimaryTimeRecord is clockIn (v1) → clockOut (v2) →
 * correct(window) (v3). That first correct is not a user Correct click —
 * there is no separate flag on TimeRecord.
 *
 * version<=3 alone cannot tell that hidden first write from a real user
 * Correct that landed at v3 (Ryan Ostwind Jul 29 4:15–4:30, Josh Mitchell
 * Jul 31 5:00–10:00). Hidden persist only exists after #197.
 */
export const HIDDEN_PRIMARY_CORRECT_VERSION = 3;

/** #197 merge — first instant hidden persist could create a TimeRecord. */
export const HIDDEN_PRIMARY_PERSIST_SEAM_AT = Date.parse(
  "2026-08-19T20:50:11.000Z",
);

export type TimeRecordLedgerRow = {
  status?: unknown;
  version?: unknown;
  clockInAt?: unknown;
  clockOutAt?: unknown;
  correctedAt?: unknown;
  createdAt?: unknown;
};

/** Row shape after persistPrimaryTimeRecord writes a finished window. */
export function hiddenPrimaryPersistLedgerRow(
  window: TimeWindow,
  createdAt = Date.now(),
): TimeRecordLedgerRow {
  return {
    status: "corrected",
    version: HIDDEN_PRIMARY_CORRECT_VERSION,
    correctedAt: createdAt,
    createdAt,
    clockInAt: window.clockInAt,
    clockOutAt: window.clockOutAt,
  };
}

function isHiddenFirstWriteCorrect(row: TimeRecordLedgerRow): boolean {
  const version = Number(row.version);
  if (!Number.isFinite(version) || version > HIDDEN_PRIMARY_CORRECT_VERSION) {
    return false;
  }
  const createdAt = toEpoch(row.createdAt);
  // Missing createdAt: fail open to CORRECTED so pre-seam / unknown rows
  // are not hidden by the v3 paint rule.
  return createdAt != null && createdAt >= HIDDEN_PRIMARY_PERSIST_SEAM_AT;
}

/** Attendance state painted in the Time sheet STATE column. */
export function timeRecordLedgerState(row: TimeRecordLedgerRow): string {
  const status = String(row.status ?? "");
  if (status !== "corrected") return status;
  if (!isHiddenFirstWriteCorrect(row)) return "corrected";
  return row.clockOutAt != null && String(row.clockOutAt) !== ""
    ? "closed"
    : "open";
}

export const CLOCK_OUT_PROMPT_FIELDS = [
  {
    name: "clockOutAt",
    label: "Clock out",
    inputType: "datetime-local" as const,
    required: true,
  },
];
