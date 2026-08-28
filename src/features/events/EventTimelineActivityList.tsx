import { useState, type DragEvent, type FormEvent } from "react";
import type { Doc, Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  EventTimelineAssigneePicker,
  type TimelineAssigneeSelection,
} from "./EventTimelineAssigneePicker";
import { EventTimelineBlockQuestions } from "./EventTimelineBlockQuestions";
import type { TimelineStaffOption } from "./eventTimelineStaffRoster";
import { GanttStrip } from "./EventTimelineGanttStrip";
import {
  formatAssigneeLabel,
  isTimelineAssigneeTeam,
  teamsFromResponsibleParty,
  type TimelineAssigneeTeam,
} from "./timelineAssigneeOptions";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

type TimelineActivity = Doc<"eventTimelineActivities">;

type Props = {
  readonly eventId: Id<"events">;
  readonly activities: TimelineActivity[];
  readonly staffOptions: readonly TimelineStaffOption[];
  readonly busy: string | null;
  readonly editingId: string | null;
  readonly onToggleEdit: (activityId: string) => void;
  readonly onDismissEdit: () => void;
  readonly onRemove: (activity: TimelineActivity) => void;
  readonly onAdjust: (
    event: FormEvent<HTMLFormElement>,
    activity: TimelineActivity,
  ) => void;
  readonly onReorder: (nextOrderedIds: readonly string[]) => void;
  readonly onAssigneesChange: (
    activity: TimelineActivity,
    selection: TimelineAssigneeSelection,
  ) => void;
};

/** Block-type badge tone. Service leads, guest-facing reads info, back-of-house
 *  prep reads warn, and load in/out stays quiet. */
const CATEGORY_TONE: Record<string, string> = {
  service: "border-accent/40 bg-accent-soft text-accent-deep",
  guest_arrival: "border-info/40 bg-info-soft text-info",
  staff_arrival: "border-info/40 bg-info-soft text-info",
  kitchen_setup: "border-warn/40 bg-warn-soft text-warn",
  bar_setup: "border-warn/40 bg-warn-soft text-warn",
  setup: "border-line-2 bg-inset text-ink-2",
  load_in: "border-line-2 bg-inset text-ink-2",
  load_out: "border-line-2 bg-mute-soft text-ink-2",
  breakdown: "border-line-2 bg-mute-soft text-ink-2",
};

function categoryLabel(category: string): string {
  const words = category.replaceAll("_", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function selectionFor(activity: TimelineActivity): TimelineAssigneeSelection {
  const fromLists = (activity.assigneeTeams ?? []).filter(
    isTimelineAssigneeTeam,
  );
  const teams: TimelineAssigneeTeam[] =
    fromLists.length > 0
      ? fromLists
      : teamsFromResponsibleParty(activity.responsibleParty);
  return {
    teams,
    personIds: activity.assigneePersonIds ?? [],
  };
}

function personNamesFor(
  personIds: readonly string[],
  staffOptions: readonly TimelineStaffOption[],
): string[] {
  const labels = new Map(
    staffOptions.map((option) => [option.personId, option.label] as const),
  );
  return personIds.map((id) => labels.get(id) ?? "Staff");
}

/** Sorted day-of activity cards with drag reorder, assignees, and questions. */
export function EventTimelineActivityList({
  eventId,
  activities,
  staffOptions,
  busy,
  editingId,
  onToggleEdit,
  onDismissEdit,
  onRemove,
  onAdjust,
  onReorder,
  onAssigneesChange,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const move = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const ids = activities.map((row) => String(row._id));
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...ids];
    const [moved] = next.splice(fromIndex, 1);
    if (moved == null) return;
    next.splice(toIndex, 0, moved);
    onReorder(next);
  };

  const onDragStart = (activityId: string) => (event: DragEvent) => {
    setDragId(activityId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", activityId);
  };

  const onDragOver =
    (activityId: string) => (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (overId !== activityId) setOverId(activityId);
    };

  const onDrop = (activityId: string) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const fromId = event.dataTransfer.getData("text/plain") || dragId;
    setDragId(null);
    setOverId(null);
    if (fromId) move(fromId, activityId);
  };

  return (
    <>
      {activities.some((activity) => activity.startsAt != null) ? (
        <div className="card p-4">
          <GanttStrip activities={activities} />
        </div>
      ) : null}
      <div className="space-y-3">
        {activities.map((activity) => {
          const isBusy = busy?.endsWith(activity._id) ?? false;
          const selection = selectionFor(activity);
          const category = (activity.category ?? "").trim();
          const partyLabel = formatAssigneeLabel({
            teams: selection.teams,
            personNames: personNamesFor(selection.personIds, staffOptions),
            fallback: activity.responsibleParty,
          });
          const isOver = overId === activity._id && dragId !== activity._id;
          return (
            <article
              key={activity._id}
              className={`card p-4 ${isOver ? "border-brand" : ""} ${
                dragId === activity._id ? "opacity-60" : ""
              }`}
              onDragOver={onDragOver(activity._id)}
              onDrop={onDrop(activity._id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  className="mt-0.5 cursor-grab rounded-sm border border-line-2 bg-canvas px-1.5 py-1 font-mono text-xs text-ink-3 active:cursor-grabbing"
                  draggable={!isBusy}
                  onDragStart={onDragStart(activity._id)}
                  aria-label={`Drag to reorder ${activity.name}`}
                  title="Drag to reorder"
                >
                  ::
                </button>

                <div className="w-24 shrink-0 text-right">
                  <p className="text-base font-semibold text-ink">
                    {formatTime(activity.startsAt)}
                    {activity.endsAt == null ? "" : " –"}
                  </p>
                  {activity.endsAt == null ? null : (
                    <p className="text-base font-semibold text-ink">
                      {formatTime(activity.endsAt)}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-ink-3">
                    {formatDate(activity.startsAt)}
                  </p>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {category ? (
                      <span
                        className={`chip ${
                          CATEGORY_TONE[category] ??
                          "border-line-2 bg-inset text-ink-2"
                        }`}
                      >
                        {categoryLabel(category)}
                      </span>
                    ) : null}
                    <h4 className="font-semibold text-ink">{activity.name}</h4>
                  </div>

                  <EventTimelineAssigneePicker
                    selection={selection}
                    staffOptions={staffOptions}
                    disabled={isBusy}
                    summaryLabel={partyLabel}
                    onChange={(next) => onAssigneesChange(activity, next)}
                  />

                  {activity.notes ? (
                    <p className="text-base text-ink-2">{activity.notes}</p>
                  ) : null}
                  {activity.siteNotes ? (
                    <p className="text-xs text-ink-3">
                      <span className="font-semibold">Site:</span>{" "}
                      {activity.siteNotes}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
                <button
                  type="button"
                  className="btn-link"
                  disabled={isBusy}
                  onClick={() => onToggleEdit(activity._id)}
                >
                  {editingId === activity._id ? "Close editor" : "Edit block"}
                </button>
                <button
                  type="button"
                  className="btn-link text-ink-3"
                  disabled={isBusy}
                  onClick={() => onRemove(activity)}
                >
                  Remove block
                </button>
              </div>

              {editingId === activity._id ? (
                <form
                  className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3"
                  onSubmit={(formEvent) => onAdjust(formEvent, activity)}
                >
                  <label className="field-label">
                    <span>Activity</span>
                    <input
                      name="name"
                      className="input"
                      defaultValue={activity.name}
                    />
                  </label>
                  <label className="field-label">
                    <span>Starts</span>
                    <BoundedDateTimeLocalInput
                      name="startsAt"
                      className="input"
                    />
                  </label>
                  <label className="field-label">
                    <span>Ends</span>
                    <BoundedDateTimeLocalInput
                      name="endsAt"
                      className="input"
                    />
                  </label>
                  <label className="field-label">
                    <span>Notes</span>
                    <input
                      name="notes"
                      className="input"
                      defaultValue={activity.notes ?? ""}
                    />
                  </label>
                  <label className="field-label sm:col-span-2 lg:col-span-3">
                    <span>Site notes</span>
                    <input
                      name="siteNotes"
                      className="input"
                      defaultValue={activity.siteNotes ?? ""}
                      placeholder="Parking, loading dock, kitchen entrance…"
                    />
                  </label>
                  <div className="flex items-end gap-1.5">
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={isBusy}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={onDismissEdit}
                    >
                      Dismiss
                    </button>
                  </div>
                </form>
              ) : null}

              <EventTimelineBlockQuestions
                eventId={eventId}
                activityId={activity._id}
              />
            </article>
          );
        })}
      </div>
    </>
  );
}
