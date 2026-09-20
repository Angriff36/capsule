import { Link, useSearchParams } from "react-router-dom";
import { EventTrackerPage } from "../EventTrackerPage";
import { eventsIndexPath } from "../eventRoutes";
import "../../home/HomeCalendar.css";
import "../EventTracker.css";
import { EventTrackerSheet } from "./EventTrackerSheet";

const VIEWS = [
  { key: "sheet", label: "Month sheet" },
  { key: "board", label: "Two-week board" },
] as const;

/**
 * The tracker has two views of the same events: the month sheet (the warehouse
 * spreadsheet) and the two-week board with drag and drop.
 */
export function EventTrackerHome() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "board" ? "board" : "sheet";

  const switcher = (
    <div
      className="tracker-view-switch"
      role="tablist"
      aria-label="Tracker view"
    >
      {VIEWS.map((entry) => (
        <button
          key={entry.key}
          type="button"
          role="tab"
          aria-selected={view === entry.key}
          data-active={view === entry.key || undefined}
          onClick={() => {
            const next = new URLSearchParams(params);
            if (entry.key === "sheet") next.delete("view");
            else next.set("view", entry.key);
            setParams(next, { replace: true });
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );

  if (view === "board") {
    return (
      <>
        {switcher}
        <EventTrackerPage />
      </>
    );
  }

  return (
    <div className="event-tracker">
      {switcher}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Events · Tracker</p>
          <h1 className="font-display mt-1 text-4xl leading-none tracking-tight text-ink">
            Event tracker
          </h1>
          <p className="mt-2 text-base text-ink-2">
            One month, one row for each event. Attach vehicles, trailers and a
            driver, mark the load and the binder, and see the pack status. Edit
            in the cell.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/logistics/style-kits" className="btn btn-ghost">
            Style kits
          </Link>
          <Link to="/" className="btn btn-ghost">
            Calendar
          </Link>
          <Link to={eventsIndexPath()} className="btn btn-ghost">
            All events
          </Link>
        </div>
      </div>
      <EventTrackerSheet />
    </div>
  );
}
