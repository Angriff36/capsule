import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { type Doc, type Id } from "../../lib/api";
import {
  useCreateEventTimelineActivity,
  useEventTimelineActivityAdjust,
  useEventTimelineActivityRemove,
  useListEventAssignment,
  useListEventTimelineActivity,
  useListPerson,
} from "../../lib/manifest-convex-react";
import { EmptyState, Skeleton } from "../../ui/primitives";
import type { BattleBoardTaskTemplate } from "./battleBoardTaskTemplates";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import type { TimelineAssigneeSelection } from "./EventTimelineAssigneePicker";
import { EventTimelineActivityList } from "./EventTimelineActivityList";
import { EventTimelineTemplatesMenu } from "./EventTimelineTemplatesMenu";
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

function compareActivities(left: TimelineActivity, right: TimelineActivity) {
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
  const people = useListPerson();
  const records = useMemo(
    () => allRecords?.filter((row) => row.eventId === eventId),
    [allRecords, eventId],
  );
  const schedule = useCreateEventTimelineActivity();
  const adjust = useEventTimelineActivityAdjust();
  const remove = useEventTimelineActivityRemove();
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
      }),
    [assignments, eventId, people],
  );

  const personNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of staffOptions) {
      map.set(option.personId, option.label);
    }
    return map;
  }, [staffOptions]);

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
      for (const slot of remapped) {
        const activity = byId.get(slot.id);
        if (activity == null) continue;
        await adjust({
          docId: activity._id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          sortOrder: slot.sortOrder,
          version:
            typeof activity.version === "number" ? activity.version : undefined,
        });
      }
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
      <EmptyState
        title="No timeline activities"
        hint="Pick a template or add an activity to build the day-of run sheet."
      />
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
    <div className="space-y-3" data-testid="event-timeline-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
          Event timeline{" "}
          <span className="font-mono text-ink-3 normal-case">
            {activities.length} {activities.length === 1 ? "entry" : "entries"}
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <EventTimelineTemplatesMenu
            disabled={busy != null}
            onPick={addFromTemplate}
          />
          <button
            type="button"
            className="btn btn-primary min-h-10"
            onClick={() => setShowAdd((value) => !value)}
          >
            {showAdd ? "Dismiss" : "+ Add"}
          </button>
        </div>
      </div>
      {failure ? <FailureBanner failure={failure} /> : null}
      {showAdd ? (
        <form
          onSubmit={submitAdd}
          className="grid gap-2 rounded-sm border border-line-2 bg-panel p-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <label className="field-label">
            <span>Activity</span>
            <input
              name="name"
              className="input"
              placeholder="Vendor arrival, service, breakdown…"
              required
              autoFocus
            />
          </label>
          <label className="field-label">
            <span>Starts</span>
            <input
              name="startsAt"
              type="datetime-local"
              className="input"
              required
            />
          </label>
          <label className="field-label">
            <span>Ends (optional)</span>
            <input name="endsAt" type="datetime-local" className="input" />
          </label>
          <label className="field-label">
            <span>Notes</span>
            <input name="notes" className="input" />
          </label>
          <button
            type="submit"
            className="btn btn-primary min-h-10 self-end"
            disabled={busy === "add"}
          >
            {busy === "add" ? "Adding…" : "Add activity"}
          </button>
        </form>
      ) : null}

      {body}
    </div>
  );
}
