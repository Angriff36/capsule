import { useUser } from "@clerk/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  useAvailabilityWindowWithdraw,
  useCreateAvailabilityWindow,
  useCreateTimeRecord,
  useListAvailabilityWindow,
  useListDelivery,
  useListEvent,
  useListEventCloseout,
  useListPackList,
  useListPackListItem,
  useListPerson,
  useListPrepTask,
  useListShift,
  useListTimeRecord,
  useListWeeklyScheduleNotice,
  usePackListItemMarkMissing,
  usePackListItemMarkPacked,
  usePrepTaskClaim,
  usePrepTaskComplete,
  usePrepTaskRelease,
  usePrepTaskStart,
  useShiftComplete,
  useShiftStart,
  useTimeRecordClockOut,
  useWeeklyScheduleNoticeAcknowledge,
} from "../../lib/manifest-convex-react";
import { formatDate, formatTime } from "../../lib/format";
import { EmptyState, StatusChip, TableSkeleton } from "../../ui/primitives";
import {
  CLOSEOUT_EVIDENCE_CATEGORIES,
  RecordPhotoCapture,
} from "../attachments/RecordPhotoCapture";
import { WorkforceFailureBanner } from "../workforce/WorkforceFailureBanner";
import {
  drainQueue,
  discardUnscopedQueuedWork,
  hasUnscopedQueuedWork,
  enqueueAction,
  useCachedRead,
  useOfflineSync,
  useOnlineStatus,
  useQueuedActions,
  type MutationRunner,
} from "./offlineStore";
import { MyDayFrame, OfflineStatusBar } from "./MyDayFrame";
import { clerkSignedInLabel } from "./MyDayIdentityResolver";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { resolveMyDayAccount } from "./resolveMyDayAccount";
import { MyDayProfileLink } from "./MyDayProfileLink";
import { ShiftSwapCard } from "./ShiftSwapCard";
import { TimeOffRequestCard } from "./TimeOffRequestCard";
import { WeeklyAvailabilityCard } from "./WeeklyAvailabilityCard";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

import { MyDayCalendar, MyDaySection as Section } from "./MyDayDashboard";
import { buildStaffUtilizationReport } from "../workforce/staffUtilization";

const dayLabel = (ms?: number | null) =>
  ms == null
    ? "Unscheduled"
    : new Date(ms).toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });

const timeLabel = (ms?: number | null) => formatTime(ms);

/** Row action button: comfortable thumb target on phones, compact on desktop. */
const ROW_BTN = "btn btn-ghost btn-sm py-2 max-sm:min-h-11";
const ROW_BTN_PRIMARY = "btn btn-primary btn-sm py-2 max-sm:min-h-11";
/** Full-width primary action inside a card. */
const BLOCK_BTN = "btn btn-primary mt-3 w-full py-3 text-lg max-sm:min-h-11";

/**
 * Phone-first view for field staff: shifts, clock in/out, prep, packing,
 * assigned deliveries, closeout photos, and time off. Rendered outside the
 * admin AppShell so none of the admin-facing navigation appears.
 */
export function MyDayPage() {
  const { user, isLoaded: clerkLoaded } = useUser();
  const authStatus = useAuthStatus();
  const offlineScope =
    clerkLoaded && user?.id && authStatus?.tenantId && authStatus.personId
      ? JSON.stringify([user.id, authStatus.tenantId, authStatus.personId])
      : null;
  const people = useCachedRead("people", useListPerson(), offlineScope);
  const shifts = useCachedRead("shifts", useListShift(), offlineScope);
  const scheduleNotices = useCachedRead(
    "scheduleNotices",
    useListWeeklyScheduleNotice(),
    offlineScope,
  );
  const records = useCachedRead(
    "timeRecords",
    useListTimeRecord(),
    offlineScope,
  );
  const tasks = useCachedRead("prepTasks", useListPrepTask(), offlineScope);
  const deliveries = useCachedRead(
    "deliveries",
    useListDelivery(),
    offlineScope,
  );
  const closeouts = useCachedRead(
    "closeouts",
    useListEventCloseout(),
    offlineScope,
  );
  const events = useCachedRead("events", useListEvent(), offlineScope);
  const packLists = useCachedRead("packLists", useListPackList(), offlineScope);
  const packItems = useCachedRead(
    "packItems",
    useListPackListItem(),
    offlineScope,
  );
  const windows = useCachedRead(
    "availabilityWindows",
    useListAvailabilityWindow(),
    offlineScope,
  );

  const clockIn = useCreateTimeRecord();
  const clockOut = useTimeRecordClockOut();
  const startShift = useShiftStart();
  const completeShift = useShiftComplete();
  const acknowledgeSchedule = useWeeklyScheduleNoticeAcknowledge();
  const claimTask = usePrepTaskClaim();
  const releaseTask = usePrepTaskRelease();
  const startTask = usePrepTaskStart();
  const completeTask = usePrepTaskComplete();
  const markItemPacked = usePackListItemMarkPacked();
  const markItemMissing = usePackListItemMarkMissing();
  const declareWindow = useCreateAvailabilityWindow();
  const withdrawWindow = useAvailabilityWindowWithdraw();

  const online = useOnlineStatus();
  const pending = useQueuedActions(offlineScope);

  // Registry of queueable mutations keyed by a stable runKey. Held in a ref so
  // the drain effect doesn't re-run on every render, while always calling the
  // freshest hook-generated function.
  const runnersRef = useRef<Record<string, MutationRunner>>({
    "clock-in": clockIn,
    "clock-out": clockOut,
    "shift-start": startShift,
    "shift-complete": completeShift,
    "schedule-acknowledge": acknowledgeSchedule,
    "task-claim": claimTask,
    "task-start": startTask,
    "task-complete": completeTask,
    "task-release": releaseTask,
    "pack-mark-packed": markItemPacked,
    "pack-mark-missing": markItemMissing,
    "availability-declare": declareWindow,
    "availability-withdraw": withdrawWindow,
  });
  runnersRef.current = {
    "clock-in": clockIn,
    "clock-out": clockOut,
    "shift-start": startShift,
    "shift-complete": completeShift,
    "schedule-acknowledge": acknowledgeSchedule,
    "task-claim": claimTask,
    "task-start": startTask,
    "task-complete": completeTask,
    "task-release": releaseTask,
    "pack-mark-packed": markItemPacked,
    "pack-mark-missing": markItemMissing,
    "availability-declare": declareWindow,
    "availability-withdraw": withdrawWindow,
  };

  const userId = user?.id;
  const signedInSubjectId = clerkLoaded && userId ? userId : undefined;
  const clerkProfileName = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    fullName: user?.fullName,
    email:
      user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress,
  };
  const clerkDisplayName = clerkSignedInLabel(clerkProfileName);
  const [showDeclare, setShowDeclare] = useState(false);
  const [openPhotoKey, setOpenPhotoKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [failure, setFailure] = useState<unknown>(null);

  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const me = resolveMyDayAccount(
    authStatus?.profile ? [authStatus.profile] : activePeople,
    authStatus,
    signedInSubjectId,
  );
  const linkedPersonName = me ? `${me.givenName} ${me.familyName}` : undefined;
  useOfflineSync(runnersRef, me ? offlineScope : null);
  const replayScope = useRef<string | null>(null);
  replayScope.current = me ? offlineScope : null;
  useEffect(() => {
    replayScope.current = me ? offlineScope : null;
    return () => {
      replayScope.current = null;
    };
  }, [me?._id, offlineScope]);

  const run = (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    void work()
      .catch(setFailure)
      .finally(() => setBusy(null));
  };

  /**
   * Queueable write: when offline, append to the pending queue (each entry
   * carries its own idempotencyKey so a replay can't double-apply) and return
   * immediately; when online, run the mutation now. `afterSuccess` only fires
   * for the online path — the queue path drains later and the optimistic UI
   * already reflects the user's intent.
   */
  const perform = (
    busyKey: string,
    runKey: string,
    label: string,
    args: Record<string, unknown>,
    afterSuccess?: () => void,
  ) => {
    if (!online) {
      setFailure(null);
      try {
        enqueueAction({ runKey, label, args }, offlineScope);
      } catch (error) {
        setFailure(error);
      }
      return;
    }
    const runner = runnersRef.current[runKey];
    if (!runner) return;
    setFailure(null);
    setBusy(busyKey);
    void Promise.resolve(runner(args))
      .then(() => afterSuccess?.())
      .catch(setFailure)
      .finally(() => setBusy(null));
  };

  const retryPending = () => {
    setFailure(null);
    void drainQueue(
      runnersRef.current,
      offlineScope,
      () => replayScope.current === offlineScope,
    ).catch(setFailure);
  };

  if (people === undefined || !clerkLoaded || authStatus === undefined) {
    return (
      <MyDayFrame signedInName={clerkDisplayName || undefined}>
        <TableSkeleton rows={6} />
      </MyDayFrame>
    );
  }

  if (!me) {
    return (
      <MyDayFrame signedInName={clerkDisplayName || undefined}>
        <MyDayProfileLink
          key={`${signedInSubjectId}:${authStatus.tenantId}`}
          hasLinkedProfile={Boolean(authStatus.personId)}
          canManage={["admin", "owner", "system"].includes(authStatus.role)}
        />
      </MyDayFrame>
    );
  }

  const mine = <T extends { personId?: string; deletedAt?: number | null }>(
    rows: T[] | undefined,
  ) =>
    (rows ?? []).filter(
      (row) => row.deletedAt == null && row.personId === me._id,
    );

  const myShifts = mine(shifts)
    .filter((row) => ["scheduled", "started"].includes(String(row.status)))
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));

  const openRecord = mine(records).find(
    (row) => String(row.status) === "open" && row.clockInAt != null,
  );

  // Attach the clock-in to my current shift (and its event) so worked time is
  // event-attributable — labor cost in closeouts and margin reads from it.
  // Best match: a shift whose window covers now (±2h slack), else today's
  // first upcoming shift.
  const clockInShift = (() => {
    const now = Date.now();
    const slack = 2 * 60 * 60 * 1000;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    return (
      myShifts.find(
        (shift) =>
          shift.startsAt != null &&
          shift.endsAt != null &&
          now >= shift.startsAt - slack &&
          now <= shift.endsAt + slack,
      ) ??
      myShifts.find(
        (shift) =>
          shift.startsAt != null &&
          shift.startsAt >= dayStart.getTime() &&
          shift.startsAt <= dayEnd.getTime(),
      )
    );
  })();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const myScheduleNotices = mine(scheduleNotices)
    .filter(
      (notice) =>
        notice.publishedAt != null &&
        notice.weekEndsAt >= startOfToday.getTime(),
    )
    .sort((a, b) => a.weekStartsAt - b.weekStartsAt);
  const unacknowledgedNotices = myScheduleNotices.filter(
    (notice) => !notice.acknowledgedAt,
  ).length;
  const myTasks = (tasks ?? [])
    .filter(
      (task) =>
        task.deletedAt == null &&
        ["pending", "claimed", "in_progress"].includes(String(task.status)) &&
        (task.dueAt == null || task.dueAt <= endOfToday.getTime()),
    )
    .sort(
      (a, b) =>
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) -
        (b.dueAt ?? Number.MAX_SAFE_INTEGER),
    );

  const packingLists = (packLists ?? []).filter(
    (list) => list.deletedAt == null && String(list.status) === "packing",
  );
  const listName = (id: string) =>
    packingLists.find((list) => list._id === id)?.name ?? "Pack list";
  const openPackItems = (packItems ?? []).filter(
    (item) =>
      item.deletedAt == null &&
      String(item.status) === "listed" &&
      packingLists.some((list) => list._id === item.packListId),
  );

  const myDeliveries = (deliveries ?? [])
    .filter(
      (delivery) =>
        delivery.deletedAt == null &&
        delivery.driverId === me._id &&
        (["scheduled", "in_transit"].includes(String(delivery.status)) ||
          (String(delivery.status) === "delivered" &&
            (delivery.deliveredAt ?? 0) >= startOfToday.getTime())),
    )
    .sort(
      (a, b) =>
        (a.windowStartsAt ?? Number.MAX_SAFE_INTEGER) -
        (b.windowStartsAt ?? Number.MAX_SAFE_INTEGER),
    );

  const fieldCloseouts = (closeouts ?? [])
    .filter(
      (closeout) =>
        closeout.deletedAt == null &&
        (String(closeout.status) === "draft" ||
          (closeout.finalizedAt ?? closeout.capturedAt ?? 0) >=
            startOfToday.getTime()),
    )
    .sort(
      (a, b) =>
        (b.capturedAt ?? b._creationTime) - (a.capturedAt ?? a._creationTime),
    )
    .slice(0, 5);
  const eventTitle = (eventId: string) =>
    events?.find((event) => event._id === eventId)?.title ?? "Event";

  const myWindows = mine(windows)
    .filter((row) => String(row.status) === "active")
    .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0));

  const submitDeclare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const toEpoch = (value: FormDataEntryValue | null) =>
      new Date(String(value)).getTime();
    const notes = String(data.get("notes") || "") || undefined;
    perform(
      "declare",
      "availability-declare",
      "Declare availability",
      {
        personId: me._id,
        startsAt: toEpoch(data.get("startsAt")),
        endsAt: toEpoch(data.get("endsAt")),
        kind: "available",
        notes,
      },
      () => setShowDeclare(false),
    );
  };

  const myRecords = mine(records);
  const lastRecord = myRecords
    .filter((record) => record.clockOutAt != null)
    .sort((a, b) => (b.clockOutAt ?? 0) - (a.clockOutAt ?? 0))[0];
  const today = new Date(now);
  const weekStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - today.getDay(),
  );
  const weekEnd = new Date(
    weekStart.getFullYear(),
    weekStart.getMonth(),
    weekStart.getDate() + 7,
  );
  const recordedHours = (startAt: number, endAt: number) =>
    records === undefined
      ? undefined
      : buildStaffUtilizationReport({
          people: [me],
          shifts: [],
          timeRecords: myRecords,
          events: [],
          startAt,
          endAt,
        }).totalHours;
  const weekHours = recordedHours(weekStart.getTime(), weekEnd.getTime());
  const hourSummaries = [
    {
      label: "Today",
      hours: recordedHours(startOfToday.getTime(), endOfToday.getTime()),
    },
    { label: "This week", hours: weekHours },
    {
      label: "This month",
      hours: recordedHours(
        new Date(today.getFullYear(), today.getMonth(), 1).getTime(),
        new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime(),
      ),
    },
  ];

  const loading =
    shifts === undefined ||
    scheduleNotices === undefined ||
    records === undefined ||
    tasks === undefined ||
    deliveries === undefined ||
    closeouts === undefined ||
    events === undefined ||
    packLists === undefined ||
    packItems === undefined ||
    windows === undefined;

  return (
    <MyDayFrame
      wide
      signedInName={clerkDisplayName}
      linkedPersonName={linkedPersonName}
      weeklyHours={weekHours}
      shiftCount={shifts === undefined ? undefined : myShifts.length}
    >
      {hasUnscopedQueuedWork() && (
        <div className="text-base text-warn">
          <p role="status">
            Older unsynced actions have no account information and cannot be
            replayed safely. They remain stored on this device unless you
            discard them.
          </p>
          <button
            type="button"
            className="btn btn-danger mt-2 min-h-11"
            onClick={() => {
              if (
                !window.confirm(
                  "Discard the older unsynced actions on this device? They will not be sent. This cannot be undone.",
                )
              )
                return;
              try {
                discardUnscopedQueuedWork();
              } catch (error) {
                setFailure(error);
              }
            }}
          >
            Discard older actions
          </button>
        </div>
      )}
      <OfflineStatusBar
        online={online}
        pending={pending}
        onRetry={retryPending}
      />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}
      {loading ? (
        <div role="status" aria-label="Loading your day">
          <TableSkeleton rows={8} />
        </div>
      ) : (
        <>
          <div className="my-day-dashboard-grid md:grid-cols-2">
            <div id="my-day-timesheets" className="my-day-clock-panel">
              <Section title="Time clock">
                <div className="my-day-clock-body">
                  <div className="my-day-clock-status">
                    <span>Status</span>
                    <StatusChip
                      status={openRecord ? "started" : "closed"}
                      label={openRecord ? "Clocked in" : "Clocked out"}
                    />
                  </div>
                  <div className="my-day-current-time">
                    <span>Current time</span>
                    <time dateTime={new Date(now).toISOString()}>
                      {timeLabel(now)}
                    </time>
                  </div>
                  <div className="my-day-hour-stats">
                    {hourSummaries.map(({ label, hours }) => (
                      <div key={label}>
                        <strong>
                          {hours == null
                            ? "—"
                            : `${hours.toLocaleString([], { maximumFractionDigits: 1 })}h`}
                        </strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="my-day-hours-note">
                    Closed records · net of breaks
                  </p>
                  <p className="text-base text-ink-2">
                    {openRecord
                      ? `Clocked in at ${timeLabel(openRecord.clockInAt)}`
                      : "You are not clocked in."}
                  </p>
                  {openRecord ? (
                    <button
                      className={BLOCK_BTN}
                      disabled={busy != null}
                      onClick={() =>
                        perform("clock-out", "clock-out", "Clock out", {
                          docId: openRecord._id,
                          version: openRecord.version,
                        })
                      }
                    >
                      {busy === "clock-out" ? "Clocking out…" : "Clock out"}
                    </button>
                  ) : (
                    <button
                      className={BLOCK_BTN}
                      disabled={busy != null}
                      onClick={() =>
                        perform("clock-in", "clock-in", "Clock in", {
                          personId: me._id,
                          ...(clockInShift
                            ? {
                                shiftId: clockInShift._id,
                                ...(clockInShift.eventId
                                  ? { eventId: clockInShift.eventId }
                                  : {}),
                              }
                            : {}),
                        })
                      }
                    >
                      {busy === "clock-in" ? "Clocking in…" : "Clock in"}
                    </button>
                  )}
                </div>
                <div className="my-day-last-record">
                  <span>Last clock-out</span>
                  {lastRecord ? (
                    <>
                      <strong>{dayLabel(lastRecord.clockOutAt)}</strong>
                      <span>
                        {timeLabel(lastRecord.clockInAt)} –{" "}
                        {timeLabel(lastRecord.clockOutAt)}
                      </span>
                      <StatusChip status={String(lastRecord.status)} />
                    </>
                  ) : (
                    <p>No completed time records yet.</p>
                  )}
                </div>
              </Section>
            </div>
            <div id="my-day-schedule" className="my-day-shifts-panel">
              <Section title="Upcoming shifts" count={myShifts.length}>
                {myShifts.length === 0 ? (
                  <EmptyState
                    title="No shifts scheduled"
                    hint="Shifts assigned to you will show up here as soon as they are published."
                  />
                ) : (
                  <ul className="flex flex-col divide-y divide-line-2 px-4">
                    {myShifts.map((shift) => (
                      <li
                        key={shift._id}
                        id={`my-day-shift-${shift._id}`}
                        className="my-day-shift-row"
                      >
                        <div className="my-day-shift-date">
                          <strong>
                            {shift.startsAt == null
                              ? "—"
                              : new Date(shift.startsAt).getDate()}
                          </strong>
                          <span>
                            {shift.startsAt == null
                              ? "TBD"
                              : new Date(shift.startsAt).toLocaleDateString(
                                  [],
                                  {
                                    month: "short",
                                  },
                                )}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-lg font-semibold">
                            {shift.eventId
                              ? eventTitle(String(shift.eventId))
                              : "Shift"}
                          </p>
                          <p className="text-sm text-ink-2">
                            {dayLabel(shift.startsAt)} ·{" "}
                            {timeLabel(shift.startsAt)} –{" "}
                            {timeLabel(shift.endsAt)}
                            {shift.role ? ` · ${shift.role}` : ""}
                          </p>
                        </div>
                        <StatusChip status={String(shift.status)} />
                        {String(shift.status) === "scheduled" &&
                        shift.scheduledAt != null ? (
                          <button
                            className={ROW_BTN}
                            disabled={busy != null}
                            onClick={() =>
                              perform(
                                `shift:${shift._id}`,
                                "shift-start",
                                "Start shift",
                                {
                                  docId: shift._id,
                                  version: shift.version,
                                },
                              )
                            }
                          >
                            Start
                          </button>
                        ) : null}
                        {String(shift.status) === "started" ? (
                          <button
                            className={ROW_BTN}
                            disabled={busy != null}
                            onClick={() =>
                              perform(
                                `shift:${shift._id}`,
                                "shift-complete",
                                "Finish shift",
                                { docId: shift._id, version: shift.version },
                              )
                            }
                          >
                            Finish
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
            <MyDayCalendar shifts={myShifts} now={now} />
            <div id="my-day-prep" className="my-day-prep-panel">
              <Section title="Today's prep" count={myTasks.length}>
                {myTasks.length === 0 ? (
                  <EmptyState
                    title="No prep tasks due today"
                    hint="Tasks the kitchen assigns for today land here."
                  />
                ) : (
                  <ul className="my-day-prep-grid">
                    {myTasks.map((task) => {
                      const status = String(task.status);
                      const key = `task:${task._id}`;
                      const next =
                        status === "pending"
                          ? { label: "Claim", runKey: "task-claim" }
                          : status === "claimed"
                            ? { label: "Start", runKey: "task-start" }
                            : { label: "Done", runKey: "task-complete" };
                      return (
                        <li key={task._id} className="my-day-prep-task">
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold">
                              {task.name?.trim() || "Prep task"}
                            </p>
                            <p className="text-sm text-ink-2">
                              {task.station ? `${task.station} · ` : ""}
                              due {task.dueAt ? timeLabel(task.dueAt) : "today"}
                            </p>
                          </div>
                          <StatusChip status={status} />
                          <button
                            className={ROW_BTN}
                            disabled={busy != null}
                            onClick={() =>
                              perform(key, next.runKey, next.label, {
                                docId: task._id,
                                version: task.version,
                              })
                            }
                          >
                            {busy === key ? "…" : next.label}
                          </button>
                          {status === "claimed" ? (
                            <button
                              className={ROW_BTN}
                              disabled={busy != null}
                              onClick={() =>
                                perform(
                                  `${key}:release`,
                                  "task-release",
                                  "Release task",
                                  { docId: task._id, version: task.version },
                                )
                              }
                            >
                              Release
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </div>
          </div>
          <div className="my-day-secondary-grid">
            <div className="my-day-section-stack">
              <div data-testid="staff-schedule-notices">
                <Section
                  title="Published schedule"
                  count={unacknowledgedNotices}
                >
                  {myScheduleNotices.length === 0 ? (
                    <EmptyState
                      title="No published schedules are waiting for you"
                      hint="When a manager publishes your week, it appears here to acknowledge."
                    />
                  ) : (
                    <div className="px-4 py-4">
                      <p className="text-base leading-relaxed text-ink-2">
                        Review each shift summary and let your manager know you
                        received it.
                      </p>
                      <ul className="mt-3 flex flex-col gap-3">
                        {myScheduleNotices.map((notice) => {
                          const canAcknowledge =
                            notice.recipientAuthSubjectId != null &&
                            notice.recipientAuthSubjectId === user?.id;
                          return (
                            <li
                              key={notice._id}
                              className="schedule-notice-item"
                            >
                              <div className="schedule-notice-item-heading">
                                <div>
                                  <strong>
                                    Week of {dayLabel(notice.weekStartsAt)}
                                  </strong>
                                  <small>
                                    {notice.shiftCount}{" "}
                                    {notice.shiftCount === 1
                                      ? "shift"
                                      : "shifts"}
                                  </small>
                                </div>
                                {notice.acknowledgedAt ? (
                                  <StatusChip
                                    status="acknowledged"
                                    label="Received"
                                  />
                                ) : (
                                  <StatusChip status="pending" label="New" />
                                )}
                              </div>
                              <p className="schedule-notice-summary">
                                {notice.shiftSummary}
                              </p>
                              {notice.acknowledgedAt ? (
                                <p className="schedule-notice-confirmation">
                                  Acknowledged {dayLabel(notice.acknowledgedAt)}{" "}
                                  at {timeLabel(notice.acknowledgedAt)}
                                </p>
                              ) : canAcknowledge ? (
                                <button
                                  className={BLOCK_BTN}
                                  data-testid="acknowledge-schedule-action"
                                  disabled={busy != null}
                                  onClick={() =>
                                    perform(
                                      `acknowledge:${notice._id}`,
                                      "schedule-acknowledge",
                                      "Acknowledge schedule",
                                      {
                                        docId: notice._id,
                                        version: notice.version,
                                      },
                                    )
                                  }
                                >
                                  {busy === `acknowledge:${notice._id}`
                                    ? "Acknowledging…"
                                    : "Acknowledge schedule"}
                                </button>
                              ) : (
                                <p className="schedule-notice-link-help">
                                  Ask a manager to link this staff profile to
                                  your sign-in before acknowledging.
                                </p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </Section>
              </div>
              <ShiftSwapCard person={me} />{" "}
            </div>
            <div className="my-day-section-stack">
              <Section title="Pack list items" count={openPackItems.length}>
                {openPackItems.length === 0 ? (
                  <EmptyState
                    title="Nothing is waiting to be packed"
                    hint="Items from active pack lists appear here when packing starts."
                  />
                ) : (
                  <ul className="flex flex-col divide-y divide-line-2 px-4">
                    {openPackItems.map((item) => (
                      <li
                        key={item._id}
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-semibold">
                            {item.description || "Item"}
                          </p>
                          <p className="text-sm text-ink-2">
                            {listName(item.packListId)} ·{" "}
                            {item.requiredQuantity} {item.unit}
                          </p>
                        </div>
                        <button
                          className={ROW_BTN_PRIMARY}
                          disabled={busy != null}
                          onClick={() =>
                            perform(
                              `pack:${item._id}`,
                              "pack-mark-packed",
                              "Mark packed",
                              {
                                docId: item._id,
                                version: item.version,
                                packedQuantity: item.requiredQuantity,
                              },
                            )
                          }
                        >
                          Packed
                        </button>
                        <button
                          className={ROW_BTN}
                          disabled={busy != null}
                          onClick={() =>
                            perform(
                              `pack:${item._id}:missing`,
                              "pack-mark-missing",
                              "Mark missing",
                              { docId: item._id, version: item.version },
                            )
                          }
                        >
                          Missing
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {myDeliveries.length > 0 ? (
                <div data-testid="my-deliveries">
                  <Section
                    title="Assigned deliveries"
                    count={myDeliveries.length}
                  >
                    <div className="px-4 py-4">
                      <p className="text-sm text-ink-3">
                        Capture proof at the drop-off so dispatch can see it
                        immediately.
                      </p>
                      <ul className="mt-1 flex flex-col divide-y divide-line-2">
                        {myDeliveries.map((delivery) => {
                          const photoKey = `delivery:${delivery._id}`;
                          const photosOpen = openPhotoKey === photoKey;
                          return (
                            <li key={delivery._id} className="py-3">
                              <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-lg font-semibold">
                                    {delivery.destination}
                                  </p>
                                  <p className="text-sm text-ink-2">
                                    {dayLabel(delivery.windowStartsAt)} ·{" "}
                                    {timeLabel(delivery.windowStartsAt)}–
                                    {timeLabel(delivery.windowEndsAt)}
                                  </p>
                                </div>
                                <StatusChip status={String(delivery.status)} />
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm min-h-10 max-sm:min-h-11"
                                  aria-expanded={photosOpen}
                                  onClick={() =>
                                    setOpenPhotoKey(
                                      photosOpen ? null : photoKey,
                                    )
                                  }
                                >
                                  {photosOpen ? "Close" : "Add photo"}
                                </button>
                              </div>
                              {photosOpen ? (
                                <div className="mt-3">
                                  <RecordPhotoCapture
                                    parentType="delivery"
                                    parentId={delivery._id}
                                    title="Proof of delivery"
                                    description="Photograph the completed drop-off, signed paperwork, or placement at the venue."
                                  />
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </Section>
                </div>
              ) : null}

              {fieldCloseouts.length > 0 ? (
                <div data-testid="my-closeouts">
                  <Section
                    title="Venue closeouts"
                    count={fieldCloseouts.length}
                  >
                    <div className="px-4 py-4">
                      <p className="text-sm text-ink-3">
                        Capture venue, leftover-food, and equipment-return
                        evidence before the team leaves.
                      </p>
                      <ul className="mt-1 flex flex-col divide-y divide-line-2">
                        {fieldCloseouts.map((closeout) => {
                          const photoKey = `closeout:${closeout._id}`;
                          const photosOpen = openPhotoKey === photoKey;
                          return (
                            <li key={closeout._id} className="py-3">
                              <div className="flex items-center gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-lg font-semibold">
                                    {eventTitle(String(closeout.eventId))}
                                  </p>
                                  <p className="text-sm text-ink-2">
                                    {closeout.capturedAt
                                      ? `Captured ${formatDate(closeout.capturedAt)} ${formatTime(closeout.capturedAt)}`
                                      : "Ready for venue photos"}
                                  </p>
                                </div>
                                <StatusChip status={String(closeout.status)} />
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm min-h-10 max-sm:min-h-11"
                                  aria-expanded={photosOpen}
                                  onClick={() =>
                                    setOpenPhotoKey(
                                      photosOpen ? null : photoKey,
                                    )
                                  }
                                >
                                  {photosOpen ? "Close" : "Add photo"}
                                </button>
                              </div>
                              {photosOpen ? (
                                <div className="mt-3">
                                  <RecordPhotoCapture
                                    parentType="closeout"
                                    parentId={closeout._id}
                                    title="Closeout evidence"
                                    description="Choose what the photo documents so the office can match it to a waste claim or credit adjustment."
                                    evidenceCategories={
                                      CLOSEOUT_EVIDENCE_CATEGORIES
                                    }
                                  />
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </Section>
                </div>
              ) : null}

              <div id="my-day-availability">
                <TimeOffRequestCard personId={me._id} busy={busy} run={run} />
              </div>

              <WeeklyAvailabilityCard personId={me._id} busy={busy} run={run} />

              <Section
                title="Specific dates"
                count={myWindows.length}
                actions={
                  <button
                    className="btn btn-ghost btn-sm py-2 max-sm:min-h-9"
                    onClick={() => setShowDeclare((value) => !value)}
                  >
                    {showDeclare ? "Close" : "Declare"}
                  </button>
                }
              >
                <div className="px-4 py-4">
                  <p className="text-sm text-ink-3">
                    Add a one-time window when you can work outside your usual
                    weekly availability.
                  </p>
                  {showDeclare ? (
                    <form
                      className="mt-3 flex flex-col gap-3"
                      onSubmit={submitDeclare}
                    >
                      <label className="field-label">
                        From
                        <BoundedDateTimeLocalInput
                          name="startsAt"
                          className="input"
                          required
                        />
                      </label>
                      <label className="field-label">
                        Until
                        <BoundedDateTimeLocalInput
                          name="endsAt"
                          className="input"
                          required
                        />
                      </label>
                      <label className="field-label">
                        Notes
                        <input name="notes" className="input" />
                      </label>
                      <button className={BLOCK_BTN} disabled={busy != null}>
                        {busy === "declare" ? "Adding…" : "Add availability"}
                      </button>
                    </form>
                  ) : null}
                  {myWindows.length === 0 ? (
                    showDeclare ? null : (
                      <EmptyState
                        title="No date-specific windows declared"
                        hint="Declare a one-off window when you can pick up extra work."
                        action={
                          <button
                            className="btn btn-ghost btn-sm max-sm:min-h-11"
                            onClick={() => setShowDeclare(true)}
                          >
                            Declare availability
                          </button>
                        }
                      />
                    )
                  ) : (
                    <ul className="mt-1 flex flex-col divide-y divide-line-2">
                      {myWindows.map((window) => (
                        <li
                          key={window._id}
                          className="flex items-center gap-3 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold">
                              {dayLabel(window.startsAt)}
                              {window.kind === "unavailable" ? (
                                <span className="ml-2 inline-flex align-middle">
                                  <StatusChip
                                    status="unavailable"
                                    label="Time off"
                                  />
                                </span>
                              ) : null}
                            </p>
                            <p className="text-sm text-ink-2">
                              {timeLabel(window.startsAt)} –{" "}
                              {timeLabel(window.endsAt)}
                            </p>
                          </div>
                          <button
                            className={ROW_BTN}
                            disabled={busy != null}
                            onClick={() =>
                              perform(
                                `window:${window._id}`,
                                "availability-withdraw",
                                "Withdraw availability",
                                { docId: window._id, version: window.version },
                              )
                            }
                          >
                            Withdraw
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Section>
            </div>
          </div>
        </>
      )}
    </MyDayFrame>
  );
}
