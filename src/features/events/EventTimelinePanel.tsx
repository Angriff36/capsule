import { useMemo, useState, type FormEvent } from "react";
import { api, type Doc, type Id } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useCreateEventTimelineActivity,
  useEventTimelineActivityAdjust,
  useEventTimelineActivityRemove,
  useListEventTimelineActivity,
} from "../../lib/manifest-convex-react";
import { EmptyState, Section, Skeleton } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

type TimelineActivity = Doc<"eventTimelineActivities">;

const optional = (value: string) => value.trim() || undefined;

const parseWhen = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
};

// ponytail: fixed 30-minute bar for activities without an end time; real
// durations only when both ends are recorded.
const MILESTONE_MS = 30 * 60 * 1000;

const BAR_COLORS = [
  "bg-accent/70",
  "bg-ok/60",
  "bg-warn/60",
  "bg-ink-3/50",
] as const;

function GanttStrip({ activities }: { activities: TimelineActivity[] }) {
  const timed = activities.filter((activity) => activity.startsAt != null);
  if (timed.length === 0) return null;
  const min = Math.min(...timed.map((activity) => Number(activity.startsAt)));
  const max = Math.max(
    ...timed.map((activity) =>
      Number(activity.endsAt ?? Number(activity.startsAt) + MILESTONE_MS),
    ),
  );
  const span = Math.max(max - min, MILESTONE_MS);
  return (
    <div className="space-y-1 rounded-xs border border-line bg-inset/40 p-3">
      {timed.map((activity, index) => {
        const start = Number(activity.startsAt);
        const end = Number(activity.endsAt ?? start + MILESTONE_MS);
        const left = ((start - min) / span) * 100;
        const width = Math.max(((end - start) / span) * 100, 1.5);
        return (
          <div
            key={activity._id}
            className="grid grid-cols-[9rem_1fr] items-center gap-2"
          >
            <span className="truncate text-[11.5px] text-ink-2">
              {activity.name}
            </span>
            <div className="relative h-4 rounded-xs bg-line/40">
              <div
                className={`absolute top-0 h-4 rounded-xs ${BAR_COLORS[index % BAR_COLORS.length]}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${activity.name} · ${formatTime(start)}${activity.endsAt != null ? `–${formatTime(end)}` : ""}${activity.responsibleParty ? ` · ${activity.responsibleParty}` : ""}`}
              />
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-[9rem_1fr] gap-2 pt-1">
        <span />
        <div className="flex justify-between font-mono text-[10px] text-ink-3">
          <span>
            {formatDate(min)} {formatTime(min)}
          </span>
          <span>
            {formatDate(max)} {formatTime(max)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function EventTimelinePanel({ eventId }: { eventId: Id<"events"> }) {
  const allRecords = useListEventTimelineActivity();
  const records = useMemo(
    () => allRecords?.filter((r) => r.eventId === eventId),
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
        .sort(
          (left, right) =>
            Number(left.startsAt ?? 0) - Number(right.startsAt ?? 0),
        ),
    [records],
  );

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

  const submitAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = parseWhen(String(data.get("startsAt") ?? ""));
    if (startsAt == null) return;
    void run("add", async () => {
      await schedule({
        eventId,
        name: String(data.get("name") ?? "").trim(),
        startsAt,
        endsAt: parseWhen(String(data.get("endsAt") ?? "")),
        responsibleParty: optional(String(data.get("responsibleParty") ?? "")),
        notes: optional(String(data.get("notes") ?? "")),
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
        name: optional(String(data.get("name") ?? "")),
        startsAt: parseWhen(String(data.get("startsAt") ?? "")),
        endsAt: parseWhen(String(data.get("endsAt") ?? "")),
        responsibleParty: optional(String(data.get("responsibleParty") ?? "")),
        notes: optional(String(data.get("notes") ?? "")),
        version,
      });
      setEditingId(null);
    });
  };

  return (
    <Section
      title="Day-of timeline"
      count={activities.length}
      actions={
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAdd((value) => !value)}
        >
          {showAdd ? "Dismiss" : "Add activity"}
        </button>
      }
    >
      <div className="space-y-3 p-3">
        {failure ? <FailureBanner failure={failure} /> : null}
        {showAdd ? (
          <form
            onSubmit={submitAdd}
            className="grid gap-2 rounded-xs border border-line bg-inset/40 p-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            <label className="field-label">
              Activity
              <input
                name="name"
                className="input"
                placeholder="Vendor arrival, service, breakdown…"
                required
                autoFocus
              />
            </label>
            <label className="field-label">
              Starts
              <input
                name="startsAt"
                type="datetime-local"
                className="input"
                required
              />
            </label>
            <label className="field-label">
              Ends (optional)
              <input name="endsAt" type="datetime-local" className="input" />
            </label>
            <label className="field-label">
              Responsible party
              <input
                name="responsibleParty"
                className="input"
                placeholder="Chef, captain, vendor…"
              />
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
            <button
              className="btn btn-primary self-end"
              disabled={busy === "add"}
            >
              {busy === "add" ? "Adding…" : "Add activity"}
            </button>
          </form>
        ) : null}

        {records === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : activities.length === 0 ? (
          <EmptyState
            title="No timeline activities"
            hint="Add vendor arrival, production start, guest arrival, service, and breakdown to build the day-of run sheet."
          />
        ) : (
          <>
            <GanttStrip activities={activities} />
            <div className="divide-y divide-line rounded-xs border border-line">
              {activities.map((activity) => {
                const isBusy = busy?.endsWith(activity._id) ?? false;
                return (
                  <article key={activity._id} className="p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium">{activity.name}</h3>
                        <p className="mt-1 font-mono text-[11px] text-ink-3">
                          {formatDate(activity.startsAt)}{" "}
                          {formatTime(activity.startsAt)}
                          {activity.endsAt != null
                            ? ` – ${formatTime(activity.endsAt)}`
                            : ""}
                          {activity.responsibleParty
                            ? ` · ${activity.responsibleParty}`
                            : ""}
                        </p>
                        {activity.notes ? (
                          <p className="mt-1 text-[11.5px] text-ink-2">
                            {activity.notes}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={isBusy}
                          onClick={() =>
                            setEditingId((current) =>
                              current === activity._id ? null : activity._id,
                            )
                          }
                        >
                          Adjust
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={isBusy}
                          onClick={() =>
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
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    {editingId === activity._id ? (
                      <form
                        className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-3"
                        onSubmit={(formEvent) =>
                          submitAdjust(formEvent, activity)
                        }
                      >
                        <label className="field-label">
                          Activity
                          <input
                            name="name"
                            className="input"
                            defaultValue={activity.name}
                          />
                        </label>
                        <label className="field-label">
                          Starts
                          <input
                            name="startsAt"
                            type="datetime-local"
                            className="input"
                          />
                        </label>
                        <label className="field-label">
                          Ends
                          <input
                            name="endsAt"
                            type="datetime-local"
                            className="input"
                          />
                        </label>
                        <label className="field-label">
                          Responsible party
                          <input
                            name="responsibleParty"
                            className="input"
                            defaultValue={activity.responsibleParty ?? ""}
                          />
                        </label>
                        <label className="field-label">
                          Notes
                          <input
                            name="notes"
                            className="input"
                            defaultValue={activity.notes ?? ""}
                          />
                        </label>
                        <div className="flex items-end gap-1.5">
                          <button
                            className="btn btn-primary btn-sm"
                            disabled={isBusy}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditingId(null)}
                          >
                            Dismiss
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
