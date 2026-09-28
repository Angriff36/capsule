import { useState } from "react";
import { formatTime } from "../../lib/format";
import { EmptyState, Section } from "../../ui/primitives";
import {
  hoursLabel,
  workedShifts,
  workedWeeks,
  type WorkedShift,
} from "./workedShifts";

type TimeRecordRow = Parameters<typeof workedShifts>[0][number];

const WEEKS_SHOWN = 6;

const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const weekLabel = (weekStart: number) =>
  `Week of ${new Date(weekStart).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;

/**
 * Every shift the signed-in staff member has worked: finished clock-ins,
 * newest first, grouped by week with the week's hours. Hours are net of
 * breaks, the same rule as the Today / This week / This month totals.
 */
export function MyPastShiftsCard({
  records,
  eventTitle,
}: {
  readonly records: readonly TimeRecordRow[];
  readonly eventTitle: (eventId: string) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shifts = workedShifts(records);
  const weeks = workedWeeks(shifts);
  const shown = showAll ? weeks : weeks.slice(0, WEEKS_SHOWN);
  const totalHours = shifts.reduce((total, row) => total + row.hours, 0);

  return (
    <div id="my-day-past-shifts" data-testid="my-past-shifts">
      <Section title="Past shifts" count={shifts.length}>
        {shifts.length === 0 ? (
          <EmptyState
            title="No worked shifts yet"
            hint="Each shift shows up here after you clock out."
          />
        ) : (
          <div className="px-4 pb-4">
            <p className="py-2 text-sm text-ink-2">
              {hoursLabel(totalHours)} worked across {shifts.length} shift
              {shifts.length === 1 ? "" : "s"}.
            </p>
            {shown.map((week) => (
              <div key={week.weekStart} className="mt-3">
                <div className="flex items-baseline justify-between border-b border-line pb-1">
                  <span className="text-sm font-semibold text-ink">
                    {weekLabel(week.weekStart)}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    {hoursLabel(week.hours)}
                  </span>
                </div>
                <ul className="divide-y divide-line-2">
                  {week.shifts.map((shift) => (
                    <PastShiftRow
                      key={shift.id}
                      shift={shift}
                      eventTitle={eventTitle}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {weeks.length > WEEKS_SHOWN ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-3"
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll
                  ? "Show recent weeks only"
                  : `Show all ${weeks.length} weeks`}
              </button>
            ) : null}
          </div>
        )}
      </Section>
    </div>
  );
}

function PastShiftRow({
  shift,
  eventTitle,
}: {
  readonly shift: WorkedShift;
  readonly eventTitle: (eventId: string) => string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">
          {shift.eventId ? eventTitle(shift.eventId) : "Shift"}
        </span>
        <span className="block text-sm text-ink-2">
          {dateLabel(shift.clockInAt)} · {formatTime(shift.clockInAt)} –{" "}
          {formatTime(shift.clockOutAt)}
          {shift.breakMinutes > 0 ? ` · ${shift.breakMinutes} min break` : ""}
        </span>
      </span>
      {/* No status chip: every row is a finished shift, and entering a past
          shift uses a hidden correction, so "Corrected" would mislead. */}
      <span className="shrink-0 font-semibold text-ink">
        {hoursLabel(shift.hours)}
      </span>
    </li>
  );
}
