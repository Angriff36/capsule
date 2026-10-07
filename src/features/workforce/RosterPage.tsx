import { useEffect, useState, type FormEvent } from "react";
import {
  useCreateEventAssignment,
  useCreateWeeklyScheduleNotice,
  useEventAssignmentCheckIn,
  useEventAssignmentCheckOut,
  useEventAssignmentConfirm,
  useEventAssignmentDecline,
  useEventAssignmentMarkNoShow,
  useEventAssignmentUnassign,
  useListEventAssignment,
  useListEventStaffNeed,
  useListPerson,
  useListQualification,
  useListShift,
  useListShiftType,
  useListTrainingCompletion,
  useListTrainingModule,
  useListTimeOffRequest,
  useListWeeklyScheduleNotice,
  useShiftCancel,
  useShiftComplete,
  useShiftMarkNoShow,
  useShiftStart,
  useWeeklyScheduleNoticeRepublishSchedule,
} from "../../lib/manifest-convex-react";
import type { Id } from "../../lib/api";
import { findApprovedTimeOffConflict } from "../../lib/timeOff";
import { useScheduleShift } from "../../lib/workforceScheduling";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatCountNoun, formatDate, formatTime } from "../../lib/format";
import { useActionPrompt } from "../../ui/action-prompt";
import { reportActionOk } from "../../ui/action-result";
import { runBulkItems } from "../../ui/bulk-select";
import { useWorkingEventId } from "../events/workingEvent";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import { AvailabilityGridSection } from "./AvailabilityGridSection";
import {
  DEFAULT_OVERTIME_THRESHOLD_HOURS,
  projectWeeklyHours,
} from "./overtimeProjection";
import {
  addScheduleWeeks,
  buildStaffShiftSummary,
  shiftsInScheduleWeek,
  startOfScheduleWeek,
} from "./weeklySchedule";
import { ShiftRescheduleAction } from "./ShiftRescheduleAction";
import { SmsAlertOptInSection } from "./SmsAlertOptInSection";
import { StaffSchedulingSection } from "./StaffSchedulingSection";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceLifecyclePolicy } from "./WorkforceLifecyclePolicy";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import { addLocalDateTimeHours } from "../../ui/naturalDate";
import {
  RosterAttentionSection,
  type OpenStaffNeed,
} from "./RosterAttentionSection";
import { findRosterConflicts } from "./rosterConflicts";

const policy = new WorkforceLifecyclePolicy();
const OVERTIME_THRESHOLD_STORAGE_KEY =
  "capsule.workforce.overtime-threshold-hours";
const SHIFT_DEFAULT_HOURS = 8;

const hours = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const formatHours = (value: number) =>
  `${hours.format(value)} ${Math.abs(value - 1) < Number.EPSILON ? "hour" : "hours"}`;

const toEpoch = (value: FormDataEntryValue | null) => {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

function initialOvertimeThreshold(): number {
  if (typeof window === "undefined") return DEFAULT_OVERTIME_THRESHOLD_HOURS;
  try {
    const stored = Number(
      window.localStorage.getItem(OVERTIME_THRESHOLD_STORAGE_KEY),
    );
    return stored > 0 && stored <= 168
      ? stored
      : DEFAULT_OVERTIME_THRESHOLD_HOURS;
  } catch {
    return DEFAULT_OVERTIME_THRESHOLD_HOURS;
  }
}

export function RosterPage() {
  const workingId = useWorkingEventId();
  const assignments = useListEventAssignment();
  const shifts = useListShift();
  const scheduleNotices = useListWeeklyScheduleNotice();
  const people = useListPerson();
  const qualifications = useListQualification();
  const trainingModules = useListTrainingModule();
  const trainingCompletions = useListTrainingCompletion();
  const shiftTypes = useListShiftType();
  const timeOffRequests = useListTimeOffRequest();
  const createAssignment = useCreateEventAssignment();
  const confirm = useEventAssignmentConfirm();
  const checkIn = useEventAssignmentCheckIn();
  const checkOut = useEventAssignmentCheckOut();
  const assignmentNoShow = useEventAssignmentMarkNoShow();
  const unassign = useEventAssignmentUnassign();
  const decline = useEventAssignmentDecline();
  const staffNeeds = useListEventStaffNeed();
  const [assignEventId, setAssignEventId] = useState<string | null>(null);
  const events = usePickerAndNamedEvents(
    assignments && shifts && staffNeeds
      ? [
          workingId,
          assignEventId,
          ...assignments.map((row) => row.eventId),
          ...shifts.map((row) => row.eventId),
          ...staffNeeds.map((row) => row.eventId),
        ]
      : undefined,
  );
  const scheduleShift = useScheduleShift();
  const createScheduleNotice = useCreateWeeklyScheduleNotice();
  const startShift = useShiftStart();
  const completeShift = useShiftComplete();
  const cancelShift = useShiftCancel();
  const shiftNoShow = useShiftMarkNoShow();
  const republishScheduleNotice = useWeeklyScheduleNoticeRepublishSchedule();
  const [showForm, setShowForm] = useState<"assignment" | "shift" | null>(null);
  const [shiftPersonId, setShiftPersonId] = useState("");
  const [shiftTypeId, setShiftTypeId] = useState("");
  const [shiftStartsAt, setShiftStartsAt] = useState("");
  const [shiftEndsAt, setShiftEndsAt] = useState("");
  const [shiftEndWasEdited, setShiftEndWasEdited] = useState(false);
  const [selectedWeekStartsAt, setSelectedWeekStartsAt] = useState(() =>
    startOfScheduleWeek(Date.now()),
  );
  const [overtimeThresholdHours, setOvertimeThresholdHours] = useState(
    initialOvertimeThreshold,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeAssignments = (assignments ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const activeShifts = (shifts ?? []).filter((row) => row.deletedAt == null);
  const activeScheduleNotices = (scheduleNotices ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const selectedPersonQualifications = (qualifications ?? []).filter(
    (qualification) =>
      qualification.deletedAt == null &&
      qualification.status === "active" &&
      qualification.personId === shiftPersonId,
  );
  const activeTrainingModules = (trainingModules ?? []).filter(
    (module) => module.deletedAt == null && module.status === "active",
  );
  const activeShiftTypes = (shiftTypes ?? []).filter(
    (shiftType) => shiftType.deletedAt == null && shiftType.status === "active",
  );
  const selectedShiftType = activeShiftTypes.find(
    (shiftType) => shiftType._id === shiftTypeId,
  );
  const requiredTrainingModule = activeTrainingModules.find(
    (module) => module._id === selectedShiftType?.requiredTrainingModuleId,
  );
  const selectedTrainingCompletion = [...(trainingCompletions ?? [])]
    .filter(
      (completion) =>
        completion.deletedAt == null &&
        completion.recordedAt != null &&
        completion.personId === shiftPersonId &&
        completion.trainingModuleId ===
          selectedShiftType?.requiredTrainingModuleId,
    )
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
  const assignEventStage = events?.find(
    (event) => event._id === (assignEventId ?? workingId),
  )?.stage;
  const assignEventFinished =
    assignEventStage === "completed" || assignEventStage === "closed_out";
  const eventName = (id: string | null | undefined) =>
    events?.find((event) => event._id === id)?.title ?? "—";
  // Events a shift can be for: coming ones first, by date, plus the working
  // event; finished and cancelled events stay out of the way.
  const DAY_MS = 86_400_000;
  const pickableEvents = (events ?? [])
    .filter(
      (item) =>
        item.deletedAt == null &&
        (item._id === workingId ||
          (!["cancelled", "closed_out", "completed"].includes(
            String(item.stage),
          ) &&
            Number(item.endsAt ?? item.startsAt ?? 0) >= Date.now() - DAY_MS)),
    )
    .sort((a, b) => Number(a.startsAt ?? 0) - Number(b.startsAt ?? 0));
  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName ?? ""}`.trim()
      : "Unknown";
  };
  const liveEventIds = new Set(
    (events ?? [])
      .filter(
        (event) =>
          event.deletedAt == null &&
          !["cancelled", "completed", "closed_out"].includes(event.stage) &&
          // A spot on an event that already ended can no longer be filled.
          Number(event.endsAt ?? event.startsAt ?? Infinity) >= Date.now(),
      )
      .map((event) => event._id as string),
  );
  const openNeeds: OpenStaffNeed[] = (staffNeeds ?? [])
    .filter(
      (need) =>
        need.deletedAt == null &&
        (need.status === "open" || need.status === "claimed") &&
        liveEventIds.has(need.eventId),
    )
    .sort((a, b) => (a.startsAt ?? Infinity) - (b.startsAt ?? Infinity))
    .map((need) => ({
      id: need._id,
      eventId: need.eventId,
      eventTitle: eventName(need.eventId),
      role: need.role,
      startsAt: need.startsAt ?? null,
      endsAt: need.endsAt ?? null,
      claimedBy: need.claimedByPersonId
        ? personName(need.claimedByPersonId)
        : null,
    }));
  // Clashes on shifts that already ended need no action; show what is ahead.
  const rosterConflicts = findRosterConflicts({
    shifts: activeShifts,
    timeOff: timeOffRequests ?? [],
    qualifications: qualifications ?? [],
    eventTitle: eventName,
    personName,
  }).filter((conflict) => conflict.endsAt >= Date.now());
  const selectedWeekEndsAt = addScheduleWeeks(selectedWeekStartsAt, 1);
  const selectedWeekShifts = shiftsInScheduleWeek(
    activeShifts,
    selectedWeekStartsAt,
  );
  const scheduledPersonIds = [
    ...new Set(selectedWeekShifts.map((shift) => String(shift.personId))),
  ];
  const selectedWeekNotices = activeScheduleNotices.filter(
    (notice) => notice.weekStartsAt === selectedWeekStartsAt,
  );
  const latestNoticeByPerson = new Map<
    string,
    (typeof selectedWeekNotices)[number]
  >();
  for (const notice of selectedWeekNotices) {
    const current = latestNoticeByPerson.get(String(notice.personId));
    if ((notice.publishedAt ?? 0) >= (current?.publishedAt ?? 0)) {
      latestNoticeByPerson.set(String(notice.personId), notice);
    }
  }
  const publicationRows = scheduledPersonIds.map((personId) => {
    const personShifts = selectedWeekShifts.filter(
      (shift) => String(shift.personId) === personId,
    );
    const person = people?.find((row) => row._id === personId);
    const shiftSummary = buildStaffShiftSummary(personShifts, eventName);
    const notice = latestNoticeByPerson.get(personId);
    const current =
      notice != null &&
      notice.shiftCount === personShifts.length &&
      notice.shiftSummary === shiftSummary &&
      (notice.recipientAuthSubjectId ?? undefined) ===
        (person?.authSubjectId ?? undefined);
    return {
      personId,
      person,
      personShifts,
      shiftSummary,
      notice,
      current,
    };
  });
  const currentPublicationRows = publicationRows.filter((row) => row.current);
  const acknowledgedPublicationRows = currentPublicationRows.filter(
    (row) => row.notice?.acknowledgedAt != null,
  );
  const outstandingPublicationRows = currentPublicationRows.filter(
    (row) => row.notice?.acknowledgedAt == null,
  );
  const unpublishedPublicationRows = publicationRows.filter(
    (row) => !row.current,
  );
  const scheduleNeedsPublication = unpublishedPublicationRows.length > 0;
  const weekHasNotStarted = Date.now() < selectedWeekStartsAt;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        OVERTIME_THRESHOLD_STORAGE_KEY,
        String(overtimeThresholdHours),
      );
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
  }, [overtimeThresholdHours]);

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = data.get("startsAt")
      ? toEpoch(data.get("startsAt"))
      : undefined;
    const endsAt = data.get("endsAt") ? toEpoch(data.get("endsAt")) : undefined;
    void run("create-assignment", async () => {
      await createAssignment({
        eventId: String(data.get("eventId")),
        personId: String(data.get("personId")),
        role: String(data.get("role")),
        startsAt,
        endsAt,
        notes: String(data.get("notes") || "") || undefined,
        overrideReason:
          String(data.get("overrideReason") || "").trim() || undefined,
      });
      form.reset();
      setShowForm(null);
    });
  };

  const submitShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const personId = String(data.get("personId"));
    const startsAt = toEpoch(data.get("startsAt"));
    const endsAt = toEpoch(data.get("endsAt"));
    const selectedTypeId = String(data.get("shiftTypeId") || "") || undefined;
    const approvedTimeOff = findApprovedTimeOffConflict(timeOffRequests ?? [], {
      personId,
      startsAt,
      endsAt,
    });
    if (approvedTimeOff) {
      setFailure(
        new Error(
          `${personName(personId)} has approved time off from ${formatDate(
            approvedTimeOff.startsAt ?? 0,
          )} through ${formatDate(
            (approvedTimeOff.endsAt ?? 1) - 1,
          )}. Choose another person or adjust the shift.`,
        ),
      );
      return;
    }
    if (requiredTrainingModule && !selectedTrainingCompletion) {
      setFailure(
        new Error(
          `${personName(personId)} must complete ${requiredTrainingModule.name} before this shift type can be scheduled.`,
        ),
      );
      return;
    }
    const overtimeProjection = projectWeeklyHours({
      shifts: activeShifts,
      proposedShift: { personId, startsAt, endsAt },
      thresholdHours: overtimeThresholdHours,
    }).find((projection) => projection.exceedsThreshold);

    void (async () => {
      if (overtimeProjection) {
        const shouldSchedule = await prompt.askConfirm({
          title: "Overtime warning",
          description: `${personName(personId)} is projected for ${formatHours(overtimeProjection.projectedHours)} in the week of ${formatDate(overtimeProjection.weekStartsAt)} (${formatHours(overtimeProjection.existingHours)} committed + ${formatHours(overtimeProjection.proposedHours)} proposed). That is ${formatHours(overtimeProjection.overtimeHours)} over the ${hours.format(overtimeProjection.thresholdHours)}-hour threshold.`,
          confirmLabel: "Schedule anyway",
          cancelLabel: "Review shift",
        });
        if (!shouldSchedule) return;
      }

      await run("create-shift", async () => {
        await scheduleShift({
          personId: personId as Id<"people">,
          startsAt,
          endsAt,
          eventId:
            (String(data.get("eventId") || "") as Id<"events">) || undefined,
          role: String(data.get("role") || "") || undefined,
          shiftTypeId: selectedTypeId as Id<"shiftTypes"> | undefined,
          requiredQualificationId:
            (String(
              data.get("requiredQualificationId") || "",
            ) as Id<"qualifications">) || undefined,
          requiredTrainingCompletionId: requiredTrainingModule
            ? (selectedTrainingCompletion?._id as Id<"trainingCompletions">)
            : undefined,
          notes: String(data.get("notes") || "") || undefined,
        });
        form.reset();
        setShiftPersonId("");
        setShiftTypeId("");
        setShiftStartsAt("");
        setShiftEndsAt("");
        setShiftEndWasEdited(false);
        setShowForm(null);
        // The roster may show another week, so say where the shift went.
        reportActionOk(
          `${personName(personId)} scheduled ${formatDate(startsAt)}, ${formatTime(startsAt)}.`,
        );
      });
    })();
  };

  const publishSelectedWeek = () => {
    // A stop part way says how many were published; pressing again is safe.
    void run("publish-week", async () => {
      await runBulkItems(unpublishedPublicationRows, async (row) => {
        const recipientAuthSubjectId = row.person?.authSubjectId ?? undefined;
        if (row.notice) {
          await republishScheduleNotice({
            docId: row.notice._id,
            version: row.notice.version,
            recipientAuthSubjectId,
            shiftCount: row.personShifts.length,
            shiftSummary: row.shiftSummary,
          });
        } else {
          await createScheduleNotice({
            personId: row.personId,
            recipientAuthSubjectId,
            weekStartsAt: selectedWeekStartsAt,
            weekEndsAt: selectedWeekEndsAt,
            shiftCount: row.personShifts.length,
            shiftSummary: row.shiftSummary,
            idempotencyKey: `weekly-schedule:${selectedWeekStartsAt}:${row.personId}`,
          });
        }
      });
    });
  };

  const invokeAssignment = (row: any, key: string) => {
    if (key === "decline") {
      void (async () => {
        const reason = (
          await prompt.askReason({
            title: "Can't make it",
            description: `${personName(row.personId)} can't work ${eventName(row.eventId)}. Their shift is freed so someone else can cover it.`,
            label: "Why",
            confirmLabel: "Free this work",
          })
        )?.trim();
        if (!reason) return;
        await run(`${row._id}:${key}`, async () => {
          await decline({ docId: row._id, version: row.version, reason });
        });
      })();
      return;
    }
    void run(`${row._id}:${key}`, async () => {
      const args = { docId: row._id, version: row.version };
      if (key === "confirm") await confirm(args);
      if (key === "checkIn") await checkIn(args);
      if (key === "checkOut") await checkOut(args);
      if (key === "markNoShow") await assignmentNoShow(args);
      if (key === "unassign") await unassign(args);
    });
  };

  const invokeShift = (row: any, key: string) => {
    if (key === "cancel") {
      void (async () => {
        const reason = (
          await prompt.askReason({
            title: "Cancel shift",
            description: "Cancel this scheduled shift.",
            label: "Cancellation reason",
            confirmLabel: "Cancel shift",
            tone: "danger",
          })
        )?.trim();
        if (!reason) return;
        await run(`${row._id}:${key}`, async () => {
          await cancelShift({ docId: row._id, version: row.version, reason });
        });
      })();
      return;
    }
    void run(`${row._id}:${key}`, async () => {
      const args = { docId: row._id, version: row.version };
      if (key === "start") await startShift(args);
      if (key === "complete") await completeShift(args);
      if (key === "markNoShow") await shiftNoShow(args);
    });
  };

  const loading =
    assignments === undefined ||
    shifts === undefined ||
    scheduleNotices === undefined ||
    events === undefined ||
    people === undefined ||
    qualifications === undefined ||
    trainingModules === undefined ||
    trainingCompletions === undefined ||
    shiftTypes === undefined ||
    staffNeeds === undefined ||
    timeOffRequests === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Roster</p>
          <h1 className="display-title mt-2">Event staffing roster</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Assign people to events and schedule shifts. Staff confirm, check in
            and out of their own work; managers control the rest.
          </p>
        </div>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}
      {host}

      {loading ? null : (
        <RosterAttentionSection
          openNeeds={openNeeds}
          conflicts={rosterConflicts}
        />
      )}

      <AvailabilityGridSection people={activePeople} />

      <SmsAlertOptInSection people={activePeople} />
      <StaffSchedulingSection people={activePeople} />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Coverage</p>
            <h2>Event assignments</h2>
          </div>
          <div className="supply-row-actions">
            <span className="font-mono text-2xs text-ink-3 uppercase">
              {formatCountNoun(activeAssignments.length, "assignment")}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setShowForm((value) =>
                  value === "assignment" ? null : "assignment",
                )
              }
            >
              {showForm === "assignment" ? "Close form" : "Add assignment"}
            </button>
          </div>
        </div>
        {showForm === "assignment" ? (
          <form className="supply-form" onSubmit={submitAssignment}>
            <div className="supply-form-heading">
              <div>
                <p className="eyebrow">New assignment</p>
                <h2>Assign a person to an event</h2>
              </div>
              <button
                className="btn btn-primary"
                disabled={
                  busy != null ||
                  (requiredTrainingModule != null &&
                    selectedTrainingCompletion == null)
                }
              >
                {busy === "create-assignment" ? "Assigning…" : "Assign"}
              </button>
            </div>
            <div className="supply-form-grid">
              <label className="field-label">
                Event
                <select
                  key={events?.length ? "events-ready" : "events-loading"}
                  name="eventId"
                  className="input"
                  defaultValue={workingId ?? ""}
                  onChange={(change) => setAssignEventId(change.target.value)}
                  required
                >
                  <option value="">Select event</option>
                  {pickableEvents.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.startsAt != null
                        ? `${item.title} · ${formatDate(item.startsAt)}`
                        : item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Person
                <select name="personId" className="input" required>
                  <option value="">Select person</option>
                  {activePeople.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.givenName} {item.familyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Role
                <input
                  name="role"
                  className="input"
                  placeholder="server"
                  required
                />
              </label>
              <label className="field-label">
                Starts
                <BoundedDateTimeLocalInput name="startsAt" className="input" />
              </label>
              <label className="field-label">
                Ends
                <BoundedDateTimeLocalInput name="endsAt" className="input" />
              </label>
              <label className="field-label">
                Notes
                <input name="notes" className="input" />
              </label>
              {assignEventFinished ? (
                <label className="field-label">
                  This event is over. Why add someone now?
                  <input
                    name="overrideReason"
                    className="input"
                    placeholder="Covered the bar; recording it after"
                    required
                  />
                </label>
              ) : null}
            </div>
          </form>
        ) : null}
        {loading ? (
          <TableSkeleton rows={5} />
        ) : activeAssignments.length === 0 ? (
          <EmptyState
            title="No one is assigned to an event."
            hint="Assign an active person to an event with a role."
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowForm("assignment")}
              >
                Add assignment
              </button>
            }
          />
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table phone-cards">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Person</th>
                  <th>Role</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeAssignments.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{eventName(row.eventId)}</strong>
                    </td>
                    <td data-label="Person">{personName(row.personId)}</td>
                    <td data-label="Role">{row.role || "—"}</td>
                    <td data-label="State">
                      <StatusChip status={String(row.status)} />
                      {row.declineReason ? (
                        <div className="text-2xs text-ink-3">
                          Can't make it: {row.declineReason}
                        </div>
                      ) : null}
                      {row.overrideReason ? (
                        <div className="text-2xs text-ink-3">
                          Added after the event: {row.overrideReason}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .assignmentActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invokeAssignment(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h2>Weekly shifts</h2>
          </div>
          <div className="supply-row-actions">
            <span className="font-mono text-2xs text-ink-3 uppercase">
              {formatCountNoun(selectedWeekShifts.length, "shift")}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                setShowForm((value) => (value === "shift" ? null : "shift"))
              }
            >
              {showForm === "shift" ? "Close form" : "Add shift"}
            </button>
          </div>
        </div>
        {showForm === "shift" ? (
          <form className="supply-form" onSubmit={submitShift}>
            <div className="supply-form-heading">
              <div>
                <p className="eyebrow">New shift</p>
                <h2>Schedule a shift</h2>
              </div>
              <button className="btn btn-primary" disabled={busy != null}>
                {busy === "create-shift" ? "Scheduling…" : "Schedule"}
              </button>
            </div>
            <div className="supply-form-grid">
              <label className="field-label">
                Person
                <select
                  name="personId"
                  className="input"
                  value={shiftPersonId}
                  onChange={(event) => setShiftPersonId(event.target.value)}
                  required
                >
                  <option value="">Select person</option>
                  {activePeople.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.givenName} {item.familyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Overtime threshold (hours)
                <input
                  name="overtimeThresholdHours"
                  className="input"
                  type="number"
                  min="0.5"
                  max="168"
                  step="0.5"
                  value={overtimeThresholdHours}
                  data-testid="overtime-threshold-hours"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next > 0 && next <= 168) {
                      setOvertimeThresholdHours(next);
                    }
                  }}
                />
                <small>Saved for this browser</small>
              </label>
              <label className="field-label">
                Starts
                <BoundedDateTimeLocalInput
                  name="startsAt"
                  className="input"
                  required
                  value={shiftStartsAt}
                  onResolvedValue={(next) => {
                    setShiftStartsAt(next);
                    if (!shiftEndsAt || !shiftEndWasEdited) {
                      setShiftEndsAt(
                        addLocalDateTimeHours(next, SHIFT_DEFAULT_HOURS),
                      );
                    }
                  }}
                />
              </label>
              <label className="field-label">
                Ends
                <BoundedDateTimeLocalInput
                  name="endsAt"
                  className="input"
                  required
                  value={shiftEndsAt}
                  naturalDateAnchor={shiftStartsAt}
                  onResolvedValue={(next) => {
                    setShiftEndsAt(next);
                    setShiftEndWasEdited(true);
                  }}
                />
              </label>
              <label className="field-label">
                Event (optional)
                <select
                  key={events?.length ? "events-ready" : "events-loading"}
                  name="eventId"
                  className="input"
                  defaultValue={workingId ?? ""}
                >
                  <option value="">No event</option>
                  {pickableEvents.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.startsAt != null
                        ? `${item.title} · ${formatDate(item.startsAt)}`
                        : item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Role
                <input name="role" className="input" placeholder="captain" />
              </label>
              <label className="field-label">
                Shift type
                <select
                  name="shiftTypeId"
                  className="input"
                  value={shiftTypeId}
                  onChange={(event) => setShiftTypeId(event.target.value)}
                >
                  <option value="">Standard shift · no training gate</option>
                  {activeShiftTypes.map((shiftType) => (
                    <option key={shiftType._id} value={shiftType._id}>
                      {shiftType.name}
                      {shiftType.requiredTrainingModuleId
                        ? ` · requires ${
                            activeTrainingModules.find(
                              (module) =>
                                module._id ===
                                shiftType.requiredTrainingModuleId,
                            )?.name ?? "training"
                          }`
                        : ""}
                    </option>
                  ))}
                </select>
                {requiredTrainingModule ? (
                  <small
                    className={
                      selectedTrainingCompletion ? "text-ok" : "text-danger"
                    }
                    data-testid="training-gate-status"
                  >
                    {selectedTrainingCompletion
                      ? `${requiredTrainingModule.name} completed ${formatDate(
                          selectedTrainingCompletion.completedAt ?? 0,
                        )} · ${selectedTrainingCompletion.assessmentScore}%`
                      : `Missing ${requiredTrainingModule.name}. Record it in Staff → Training first.`}
                  </small>
                ) : null}
              </label>
              <label className="field-label">
                Required certification (optional)
                <select name="requiredQualificationId" className="input">
                  <option value="">
                    {shiftPersonId
                      ? "No certification prerequisite"
                      : "Select a person first"}
                  </option>
                  {selectedPersonQualifications.map((qualification) => (
                    <option key={qualification._id} value={qualification._id}>
                      {qualification.name}
                      {qualification.certificationType
                        ? ` · ${qualification.certificationType}`
                        : ""}
                      {qualification.expiresAt
                        ? ` · expires ${formatDate(qualification.expiresAt)}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Notes
                <input name="notes" className="input" />
              </label>
            </div>
          </form>
        ) : null}
        <div className="schedule-publish-panel">
          <div className="schedule-publish-heading">
            <div>
              <p className="eyebrow">Work week</p>
              <strong>
                {formatDate(selectedWeekStartsAt)} –{" "}
                {formatDate(selectedWeekEndsAt - 1)}
              </strong>
              <small>
                {scheduledPersonIds.length} scheduled{" "}
                {scheduledPersonIds.length === 1 ? "person" : "people"}
              </small>
            </div>
            <div
              className="schedule-week-controls"
              aria-label="Choose work week"
            >
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setSelectedWeekStartsAt((week) => addScheduleWeeks(week, -1))
                }
              >
                Previous
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setSelectedWeekStartsAt(startOfScheduleWeek(Date.now()))
                }
              >
                This week
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setSelectedWeekStartsAt((week) => addScheduleWeeks(week, 1))
                }
              >
                Next
              </button>
            </div>
          </div>

          <div className="schedule-publish-status" aria-live="polite">
            <span>
              <strong>{acknowledgedPublicationRows.length}</strong> acknowledged
            </span>
            <span>
              <strong>{outstandingPublicationRows.length}</strong> awaiting
              reply
            </span>
            <span>
              <strong>{unpublishedPublicationRows.length}</strong> to publish
            </span>
          </div>

          {weekHasNotStarted && outstandingPublicationRows.length > 0 ? (
            <div
              className="schedule-ack-warning"
              role="status"
              data-testid="schedule-ack-warning"
            >
              <strong>Follow up before the week begins.</strong>
              <span>
                {outstandingPublicationRows
                  .map((row) => personName(row.personId))
                  .join(", ")}{" "}
                {outstandingPublicationRows.length === 1 ? "has" : "have"} not
                acknowledged this schedule yet.
              </span>
            </div>
          ) : null}

          {unpublishedPublicationRows.length > 0 &&
          currentPublicationRows.length > 0 ? (
            <p className="schedule-publish-note">
              {unpublishedPublicationRows.length} staff summary{" "}
              {unpublishedPublicationRows.length === 1 ? "is" : "are"} new or
              changed. Publishing sends only those updates.
            </p>
          ) : null}

          <button
            className="btn btn-primary schedule-publish-action"
            data-testid="schedule-publish-action"
            disabled={
              busy != null ||
              selectedWeekShifts.length === 0 ||
              !scheduleNeedsPublication
            }
            onClick={publishSelectedWeek}
          >
            {busy === "publish-week"
              ? "Publishing…"
              : selectedWeekShifts.length === 0
                ? "No shifts to publish"
                : scheduleNeedsPublication
                  ? currentPublicationRows.length > 0
                    ? "Publish updates"
                    : "Publish schedule"
                  : "Schedule published"}
          </button>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : selectedWeekShifts.length === 0 ? (
          <EmptyState
            title="No shifts are scheduled for this week."
            hint="Choose another week or add the first shift."
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowForm("shift")}
              >
                Add shift
              </button>
            }
          />
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table phone-cards">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Event</th>
                  <th>Window</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {selectedWeekShifts.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(row.personId)}</strong>
                      <small>{row.role || ""}</small>
                      {row.shiftTypeId ? (
                        <small>
                          {
                            shiftTypes?.find(
                              (shiftType) => shiftType._id === row.shiftTypeId,
                            )?.name
                          }
                        </small>
                      ) : null}
                      {row.requiredQualificationId ? (
                        <small>
                          Requires{" "}
                          {qualifications?.find(
                            (qualification) =>
                              qualification._id === row.requiredQualificationId,
                          )?.name || "certification"}
                        </small>
                      ) : null}
                    </td>
                    <td data-label="Event">{eventName(row.eventId)}</td>
                    <td data-label="Window">
                      {row.startsAt
                        ? `${formatDate(row.startsAt)} ${formatTime(row.startsAt)}`
                        : "—"}{" "}
                      →{" "}
                      {row.endsAt
                        ? `${formatDate(row.endsAt)} ${formatTime(row.endsAt)}`
                        : "—"}
                    </td>
                    <td data-label="State">
                      <StatusChip status={String(row.status)} />
                      {row.cancellationReason ? (
                        <small>{row.cancellationReason}</small>
                      ) : null}
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        <ShiftRescheduleAction
                          shift={row}
                          prompt={prompt}
                          busy={busy}
                          run={run}
                        />
                        {policy
                          .shiftActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invokeShift(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
