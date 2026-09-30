import { useMemo, useState } from "react";
import type { Id } from "../../lib/api";
import { useEventActivity } from "../../lib/useEventActivity";
import { EmptyState, TableSkeleton } from "../../ui/primitives";
import { EventTabIntro } from "./EventTabIntro";

const dayFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * History: what happened on this event, newest first - who was put on it,
 * what was packed, checked, loaded and counted back, when the truck left and
 * why. Read only; it is built from the same records the rest of the event
 * uses.
 */
export function EventHistoryTab({ eventId }: { eventId: Id<"events"> }) {
  const activity = useEventActivity(eventId);
  const [find, setFind] = useState("");

  const days = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const rows = (activity?.rows ?? []).filter(
      (row) =>
        needle === "" ||
        `${row.text} ${row.detail ?? ""} ${row.person ?? ""}`
          .toLowerCase()
          .includes(needle),
    );
    const groups: { day: string; rows: typeof rows }[] = [];
    for (const row of rows) {
      const day = dayFmt.format(row.at);
      const last = groups[groups.length - 1];
      if (last?.day === day) last.rows.push(row);
      else groups.push({ day, rows: [row] });
    }
    return groups;
  }, [activity, find]);

  return (
    <section className="space-y-4" data-testid="event-history-tab">
      <EventTabIntro
        title="History"
        description="What happened on this event, newest first."
      />
      {activity === undefined ? (
        <TableSkeleton rows={6} />
      ) : activity === null || activity.rows.length === 0 ? (
        <EmptyState
          title="Nothing has happened on this event yet."
          hint="Changes to the crew, trucks, pack lists, equipment and to-dos show here as they are made."
        />
      ) : (
        <>
          <input
            type="search"
            className="input min-h-10 w-full max-w-sm"
            placeholder="Find in the history"
            aria-label="Find in the history"
            value={find}
            onChange={(event) => setFind(event.target.value)}
          />
          {days.length === 0 ? (
            <p className="text-base text-ink-2">Nothing matches.</p>
          ) : null}
          {days.map((group) => (
            <div key={group.day}>
              <div className="section-rule">
                <span>{group.day}</span>
                <i />
                <em>{group.rows.length}</em>
              </div>
              <ul>
                {group.rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-b border-line py-2"
                  >
                    <time
                      dateTime={new Date(row.at).toISOString()}
                      className="w-20 shrink-0 font-mono text-sm text-ink-2"
                    >
                      {timeFmt.format(row.at)}
                    </time>
                    <span className="min-w-0 flex-1 text-base text-ink">
                      <span className="font-semibold">{row.text}</span>
                      {row.detail ? (
                        <span className="text-ink-2"> · {row.detail}</span>
                      ) : null}
                    </span>
                    {row.person ? (
                      <span className="text-sm text-ink-2">{row.person}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {activity.truncated ? (
            <p className="text-sm text-ink-2">
              This event has a long history. The newest changes are shown.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
