import { useState, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "../../ui/icons";

export function MyDaySection({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="my-day-panel">
      <header className="my-day-panel-heading">
        <h2>
          {title}
          {count != null && <span className="my-day-count">{count}</span>}
        </h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

type CalendarShift = {
  _id: string;
  startsAt?: number | null;
  endsAt?: number | null;
};

export function MyDayCalendar({
  shifts,
  now,
}: {
  shifts: CalendarShift[];
  now: number;
}) {
  const today = new Date(now);
  const [offset, setOffset] = useState(0);
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((month.getDay() + days) / 7) * 7 },
    (_, index) => {
      const day = index - month.getDay() + 1;
      return day > 0 && day <= days ? day : null;
    },
  );
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
  return (
    <section
      className="my-day-panel my-day-calendar"
      aria-label="Shift calendar"
    >
      <header className="my-day-panel-heading">
        <h2 aria-live="polite">
          {month.toLocaleDateString([], { month: "long", year: "numeric" })}
        </h2>
        <div className="my-day-calendar-controls">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </header>
      <table>
        <caption className="sr-only">
          Scheduled shifts. Select a marked date to go to its shift.
        </caption>
        <thead>
          <tr>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <th key={day} scope="col">
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: cells.length / 7 }, (_, row) => (
            <tr key={row}>
              {cells.slice(row * 7, row * 7 + 7).map((day, column) => {
                if (day == null) return <td key={column} />;
                const date = new Date(
                  month.getFullYear(),
                  month.getMonth(),
                  day,
                );
                const next = new Date(
                  month.getFullYear(),
                  month.getMonth(),
                  day + 1,
                );
                const shift = shifts.find(
                  (item) =>
                    item.startsAt != null &&
                    item.startsAt < next.getTime() &&
                    (item.startsAt >= date.getTime() ||
                      (item.endsAt != null && item.endsAt > date.getTime())),
                );
                const isToday = date.toDateString() === today.toDateString();
                const className = `my-day-calendar-date${isToday ? " is-today" : date >= weekStart && date < weekEnd ? " is-this-week" : ""}`;
                const label = `${date.toLocaleDateString([], { dateStyle: "full" })}${isToday ? ", today" : ""}${shift ? ", shift scheduled" : ""}`;
                return (
                  <td key={column}>
                    {shift ? (
                      <a
                        className={className}
                        href={`#my-day-shift-${shift._id}`}
                        aria-label={label}
                        aria-current={isToday ? "date" : undefined}
                      >
                        {day}
                        <span className="my-day-shift-dot" />
                      </a>
                    ) : (
                      <span
                        className={className}
                        aria-label={label}
                        aria-current={isToday ? "date" : undefined}
                      >
                        {day}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="my-day-calendar-key">
        <span>
          <i className="is-today" />
          Today
        </span>
        <span>
          <i className="my-day-shift-dot" />
          Shift
        </span>
        <span>
          <i className="is-this-week" />
          This week
        </span>
      </footer>
      {offset !== 0 && (
        <button
          type="button"
          className="my-day-text-action"
          onClick={() => setOffset(0)}
        >
          Back to this month
        </button>
      )}
    </section>
  );
}
