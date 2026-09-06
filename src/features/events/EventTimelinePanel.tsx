import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useReorderEventTimeline } from "../../lib/operational-transactions";
import { type Doc, type Id } from "../../lib/api";
import {
  useCreateEventTimelineActivity,
  useEventTimelineActivityAdjust,
  useEventTimelineActivityRemove,
  useListEventAssignment,
  useListEventStaffNeed,
  useListEventTimelineActivity,
  useListEventTimelineComment,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { EmptyState, Skeleton } from "../../ui/primitives";
import { PlusIcon } from "../../ui/icons";
import type { BattleBoardTaskTemplate } from "./battleBoardTaskTemplates";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import type { TimelineAssigneeSelection } from "./EventTimelineAssigneePicker";
import { EventTimelineActivityList } from "./EventTimelineActivityList";
import { EventTimelineAddForm } from "./EventTimelineAddForm";
import {
  EventTimelineSidebar,
  type TimelineKeyStaff,
} from "./EventTimelineSidebar";
import {
  timelineCategoryCounts,
  timelineSiteNotes,
  timelineWindow,
} from "./eventTimelineSummary";
import { EventTimelineRunSheetHeader } from "./EventTimelineRunSheetHeader";
import { EventTimelineStaffRoster } from "./eventTimelineStaffRoster";
import { FailureBanner } from "./FailureBanner";
import {
  formatAssigneeLabel,
  isTimelineAssigneeTeam,
} from "./timelineAssigneeOptions";
import { TimelineSlotRemapper } from "./timelineSlotRemapper";

type TimelineActivity = Doc<"eventTimelineActivities">;

type Props = {
  readonly eventId: Id<"events">;
  /** Used when adding a template block before the user sets a real time. */
  readonly defaultStartsAt?: number | null;
};

const optional = (value: string) => value.trim() || undefined;

const parseWhen = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
};

function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

function templateNotes(template: BattleBoardTaskTemplate): string {
  const parts = [
    template.notes,
    template.defaultLocation ? `Location: ${template.defaultLocation}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function compareActivities(
  // Structural: the comparator reads only these two fields, and Event Day
  // sorts its projected briefing rows with it too.
  left: { sortOrder?: number | null; startsAt?: number | null },
  right: { sortOrder?: number | null; startsAt?: number | null },
) {
  const leftOrder = left.sortOrder;
  const rightOrder = right.sortOrder;
  if (typeof leftOrder === "number" && typeof rightOrder === "number") {
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  } else if (typeof leftOrder === "number") {
    return -1;
  } else if (typeof rightOrder === "number") {
    return 1;
  }
  return Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0);
}

const remapper = new TimelineSlotRemapper();

/** Day-of timeline: templates, manual add, Gantt, and editable blocks. */
export function EventTimelinePanel({ eventId, defaultStartsAt }: Props) {
  const allRecords = useListEventTimelineActivity();
  const assignments = useListEventAssignment();
  const staffNeeds = useListEventStaffNeed();
  const people = useListPerson();
  const comments = useListEventTimelineComment();
  const records = useMemo(
    () => allRecords?.filter((row) => row.eventId === eventId),
    [allRecords, eventId],
  );
  const schedule = useCreateEventTimelineActivity();
  const adjust = useEventTimelineActivityAdjust();
  const remove = useEventTimelineActivityRemove();
  const reorderTimeline = useReorderEventTimeline();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);

  const activities = useMemo(
    () =>
      (records ?? [])
        .filter(
          (activity) =>
            activity.scheduledAt != null && activity.deletedAt == null,
        )
        .sort(compareActivities),
    [records],
  );

  const staffOptions = useMemo(
    () =>
      EventTimelineStaffRoster.fromAssignments({
        eventId,
        assignments,
        people,
        staffNeeds,
      }),
    [assignments, eventId, people, staffNeeds],
  );

  const keyStaff: TimelineKeyStaff[] = useMemo(() => {
    const entries = EventTimelineStaffRoster.staffingRosterEntries({
      eventId,
      assignments,
      people,
      staffNeeds,
    });
    return entries.map((entry) => ({
      key: entry.key,
      name: entry.label,
      role: entry.role,
    }));
  }, [assignments, eventId, people, staffNeeds]);

  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of staffOptions) {
      map.set(option.personId, option.label);
    }
    return map;
  }, [staffOptions]);

  const categories = useMemo(
    () => timelineCategoryCounts(activities),
    [activities],
  );
  const siteNotes = useMemo(() => timelineSiteNotes(activities), [activities]);
  const { start: windowStart, end: windowEnd } = useMemo(
    () => timelineWindow(activities),
    [activities],
  );

  const questionCount = (comments ?? []).filter(
    (row) => row.deletedAt == null && row.eventId === eventId,
  ).length;

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const nextSortOrder = () =>
    activities.reduce(
      (max, row) =>
        typeof row.sortOrder === "number" ? Math.max(max, row.sortOrder) : max,
      -1,
    ) + 1;

  const addFromTemplate = (template: BattleBoardTaskTemplate) => {
    const startsAt = defaultStartsAt ?? Date.now();
    const team =
      template.defaultTeam && isTimelineAssigneeTeam(template.defaultTeam)
        ? template.defaultTeam
        : undefined;
    void run(`tpl:${template.category}:${template.label}`, () =>
      schedule({
        eventId,
        name: template.label,
        category: template.category,
        startsAt,
        responsibleParty: team,
        assigneeTeams: team ? [team] : undefined,
        notes: templateNotes(template),
        siteNotes: "",
        sortOrder: nextSortOrder(),
      }),
    );
  };

  const submitAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = parseWhen(formText(data, "startsAt"));
    if (startsAt == null) return;
    void run("add", async () => {
      await schedule({
        eventId,
        name: formText(data, "name").trim(),
        startsAt,
        endsAt: parseWhen(formText(data, "endsAt")),
        notes: optional(formText(data, "notes")),
        sortOrder: nextSortOrder(),
      });
      form.reset();
      setShowAdd(false);
    });
  };

  const submitAdjust = (
    event: FormEvent<HTMLFormElement>,
    activity: TimelineActivity,
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const version =
      typeof activity.version === "number" ? activity.version : undefined;
    void run(`adjust-${activity._id}`, async () => {
      await adjust({
        docId: activity._id,
        name: optional(formText(data, "name")),
        startsAt: parseWhen(formText(data, "startsAt")),
        endsAt: parseWhen(formText(data, "endsAt")),
        notes: optional(formText(data, "notes")),
        siteNotes: optional(formText(data, "siteNotes")),
        version,
      });
      setEditingId(null);
    });
  };

  const submitReorder = (nextOrderedIds: readonly string[]) => {
    const previousIds = activities.map((row) => String(row._id));
    if (
      previousIds.length === nextOrderedIds.length &&
      previousIds.every((id, index) => id === nextOrderedIds[index])
    ) {
      return;
    }
    const byId = new Map(
      activities.map((row) => [String(row._id), row] as const),
    );
    const remapped = remapper.remap(previousIds, nextOrderedIds, byId);
    void run("reorder", async () => {
      await reorderTimeline({
        eventId,
        rows: remapped.map((slot) => {
          const activity = byId.get(slot.id);
          if (activity == null || typeof activity.version !== "number") {
            throw new Error(
              "Timeline activity is unavailable; refresh and retry",
            );
          }
          return {
            docId: activity._id,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
            sortOrder: slot.sortOrder,
            version: activity.version,
          };
        }),
      });
    });
  };

  const submitAssignees = (
    activity: TimelineActivity,
    selection: TimelineAssigneeSelection,
  ) => {
    const personNames = selection.personIds.map(
      (id) => personNameById.get(id) ?? "Staff",
    );
    const responsibleParty = formatAssigneeLabel({
      teams: selection.teams,
      personNames,
    });
    void run(`assign-${activity._id}`, () =>
      adjust({
        docId: activity._id,
        assigneeTeams: [...selection.teams],
        assigneePersonIds: [...selection.personIds],
        responsibleParty,
        version:
          typeof activity.version === "number" ? activity.version : undefined,
      }),
    );
  };

  let body: ReactNode;
  if (records === undefined) {
    body = (
      <div className="space-y-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  } else if (activities.length === 0) {
    body = (
      <div className="card">
        <EmptyState
          title="No timeline activities"
          hint="Pick a template or add an activity to build the day-of run sheet."
        />
      </div>
    );
  } else {
    body = (
      <EventTimelineActivityList
        eventId={eventId}
        activities={activities}
        staffOptions={staffOptions}
        busy={busy}
        editingId={editingId}
        onToggleEdit={(activityId) =>
          setEditingId((current) =>
            current === activityId ? null : activityId,
          )
        }
        onDismissEdit={() => setEditingId(null)}
        onRemove={(activity) =>
          void run(`remove-${activity._id}`, () =>
            remove({
              docId: activity._id,
              version:
                typeof activity.version === "number"
                  ? activity.version
                  : undefined,
            }),
          )
        }
        onAdjust={submitAdjust}
        onReorder={submitReorder}
        onAssigneesChange={submitAssignees}
      />
    );
  }

  return (
    <div
      className="flex flex-col gap-5 xl:flex-row"
      data-testid="event-timeline-panel"
    >
      <div className="min-w-0 flex-1 space-y-5">
        <EventTimelineRunSheetHeader
          windowStart={windowStart}
          windowEnd={windowEnd}
          blockCount={activities.length}
          disabled={busy != null}
          onPickTemplate={addFromTemplate}
        />

        {failure ? <FailureBanner failure={failure} /> : null}

        {body}

        {showAdd ? (
          <EventTimelineAddForm
            busy={busy === "add"}
            onSubmit={submitAdd}
            onDismiss={() => setShowAdd(false)}
          />
        ) : (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-line-2 px-5 py-3 font-semibold text-brand hover:border-brand hover:bg-inset"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon />
            Add timeline activity
          </button>
        )}
      </div>

      <EventTimelineSidebar
        windowStart={windowStart}
        windowEnd={windowEnd}
        categories={categories}
        keyStaff={keyStaff}
        siteNotes={siteNotes}
        questionCount={questionCount}
      />
    </div>
  );
}
