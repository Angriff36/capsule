import { Link, useSearchParams } from "react-router-dom";
import { SegmentedTabs } from "../../../ui/SegmentedTabs";
import { EventTrackerPage } from "../EventTrackerPage";
import { eventsIndexPath } from "../eventRoutes";
import "../../home/HomeCalendar.css";
import "../EventTracker.css";
import { PlanningBoardPage } from "../planning/PlanningBoardPage";
import { TrackerBoard } from "./TrackerBoard";

const VIEWS = [
  { key: "sheet", label: "Tracker" },
  { key: "board", label: "Two-week board" },
  { key: "plan", label: "Planning board" },
] as const;

/**
 * The tracker has three views of the same events: the month sheet (the
 * warehouse spreadsheet), the two-week board that moves an event to another
 * day, and the planning board that puts people, trucks and equipment on
 * events.
 */
export function EventTrackerHome() {
  const [params, setParams] = useSearchParams();
  const viewParam = params.get("view");
  const view =
    viewParam === "board" ? "board" : viewParam === "plan" ? "plan" : "sheet";

  const switcher = (
    <SegmentedTabs
      label="Tracker view"
      className="mb-4"
      options={VIEWS.map((entry) => ({ value: entry.key, label: entry.label }))}
      value={view}
      onChange={(key) => {
        const next = new URLSearchParams(params);
        if (key === "sheet") next.delete("view");
        else next.set("view", key);
        setParams(next, { replace: true });
      }}
    />
  );

  if (view === "board") {
    return (
      <>
        {switcher}
        <EventTrackerPage />
      </>
    );
  }
  if (view === "plan") {
    return (
      <>
        {switcher}
        <PlanningBoardPage />
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
            One month, one row for each event: trucks and drivers, crew,
            equipment, decor and notes. Edit in the cell. It warns before
            anything is double-booked.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/logistics/pack-templates#style-kits"
            className="btn btn-ghost"
          >
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
      <TrackerBoard />
    </div>
  );
}
