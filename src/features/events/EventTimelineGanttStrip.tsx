import type { Doc } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";

type TimelineActivity = Doc<"eventTimelineActivities">;

// ponytail: fixed 30-minute bar for activities without an end time; real
// durations only when both ends are recorded.
const MILESTONE_MS = 30 * 60 * 1000;

const BAR_COLORS = [
  "bg-accent/70",
  "bg-ok/60",
  "bg-warn/60",
  "bg-ink-3/50",
] as const;

function ganttBarTitle(activity: TimelineActivity, start: number, end: number) {
  const endLabel = activity.endsAt == null ? "" : `–${formatTime(end)}`;
  const party =
    activity.responsibleParty == null || activity.responsibleParty === ""
      ? ""
      : ` · ${activity.responsibleParty}`;
  return `${activity.name} · ${formatTime(start)}${endLabel}${party}`;
}

/** Compact Gantt bars for timed timeline activities. */
export function GanttStrip({
  activities,
}: {
  readonly activities: TimelineActivity[];
}) {
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
    <div className="space-y-1">
      <p className="eyebrow mb-2">Run of show</p>
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
            <span className="truncate text-xs text-ink-2">{activity.name}</span>
            <div className="relative h-4 rounded-xs bg-line/40">
              <div
                className={`absolute top-0 h-4 rounded-xs ${BAR_COLORS[index % BAR_COLORS.length]}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={ganttBarTitle(activity, start, end)}
              />
            </div>
          </div>
        );
      })}
      <div className="grid grid-cols-[9rem_1fr] gap-2 pt-1">
        <span />
        <div className="flex justify-between font-mono text-2xs text-ink-3">
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
