import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TPP_REPORT_CATALOG } from "../reports/tpp/catalog";
import type { TppReportDefinition } from "../reports/tpp/types";
import { eventDetailPath } from "../events/eventRoutes";
import { EventReportView } from "./EventReportView";
import type { CalendarEventFacts } from "./homeCalendar";

const STORAGE_KEY = "capsule.eventReportRail.reports";

/**
 * Every catalog report the rail can run with nothing but the event: it takes
 * the event as a parameter, and every other required parameter is a date the
 * rail can pin to the event's day. A report that also needs an enum or text
 * choice belongs in the Reports catalog, where the form asks for it.
 */
export const EVENT_REPORTS: readonly TppReportDefinition[] =
  TPP_REPORT_CATALOG.filter(
    (definition) =>
      definition.parameters.some(
        (parameter) =>
          parameter.type === "entity" && parameter.entity === "event",
      ) &&
      definition.parameters.every(
        (parameter) =>
          parameter.type === "boolean" ||
          parameter.type === "date" ||
          parameter.type === "date_range" ||
          (parameter.type === "entity" && parameter.entity === "event") ||
          !parameter.required,
      ),
  );

/** The starting list: what a coordinator prints on the way out the door. */
const DEFAULT_REPORT_IDS = [
  "event-beo",
  "event-timeline",
  "event-menu-item-production",
  "production-summary",
  "heating-serving-event-menu",
  "equipment-summary",
  "shopping-list",
  "kitchen-labor",
].filter((id) => EVENT_REPORTS.some((definition) => definition.id === id));

function storageKey(scope: string): string {
  return `${STORAGE_KEY}:${scope}`;
}

function readStoredIds(scope: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return null;
  }
}

function writeStoredIds(scope: string, ids: string[]) {
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(ids));
  } catch {
    // Browser storage is a convenience; the default list still works.
  }
}

type Active = { definition: TppReportDefinition; print: boolean };

export type EventReportLaunch = {
  eventId: string;
  reportId: string;
  print: boolean;
};

export function useEventReportList(storageScope: string) {
  const [ids, setIds] = useState<string[]>(
    () => readStoredIds(storageScope) ?? DEFAULT_REPORT_IDS,
  );

  useEffect(() => {
    setIds(readStoredIds(storageScope) ?? DEFAULT_REPORT_IDS);
  }, [storageScope]);

  const chosen = useMemo(
    () =>
      ids
        .map((id) => EVENT_REPORTS.find((definition) => definition.id === id))
        .filter(
          (definition): definition is TppReportDefinition => !!definition,
        ),
    [ids],
  );

  const toggle = (id: string) => {
    setIds((current) => {
      const next = current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id];
      writeStoredIds(storageScope, next);
      return next;
    });
  };

  return { ids, chosen, toggle };
}

/**
 * The tab pinned to the right edge of the screen. It carries the report list
 * for whichever event the calendar has selected: view a report in place, or
 * print it straight away. The list is the operator's own — edit it once and
 * the browser remembers.
 */
export function EventReportRail({
  event,
  reportIds,
  reports,
  onToggleReport,
  launch,
}: {
  event: CalendarEventFacts | null;
  reportIds: readonly string[];
  reports: readonly TppReportDefinition[];
  onToggleReport: (id: string) => void;
  launch: EventReportLaunch | null;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);

  // A closed rail is off-screen; keep its controls out of the tab order too.
  useEffect(() => {
    railRef.current?.toggleAttribute("inert", !open);
  }, [open]);

  const close = () => {
    setOpen(false);
    tabRef.current?.focus();
  };

  // A new selection resets the rail to its list and opens it.
  const eventId = event?.id ?? null;
  useEffect(() => {
    setActive(null);
    if (eventId) setOpen(true);
  }, [eventId]);

  // A launch request is consumed once; a later re-render with the same
  // request (event object refreshed, list reopened) must not replay it or
  // reopen the print dialog.
  const consumedLaunch = useRef<EventReportLaunch | null>(null);
  useEffect(() => {
    if (!launch || !event || launch.eventId !== event.id) return;
    if (consumedLaunch.current === launch) return;
    const definition = EVENT_REPORTS.find(
      (candidate) => candidate.id === launch.reportId,
    );
    if (!definition) return;
    consumedLaunch.current = launch;
    setActive({ definition, print: launch.print });
    setOpen(true);
  }, [event, launch]);

  useEffect(() => {
    if (!open) return;
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        className="home-report-tab"
        data-open={open || undefined}
        data-wide={active ? true : undefined}
        aria-expanded={open}
        aria-controls="home-report-rail"
        onClick={() => setOpen((value) => !value)}
      >
        <span>Reports</span>
        {event ? <b>{reports.length}</b> : null}
      </button>

      <aside
        ref={railRef}
        id="home-report-rail"
        className="home-report-rail"
        data-open={open || undefined}
        data-wide={active ? true : undefined}
        aria-label="Event reports"
        aria-hidden={!open}
      >
        <header className="home-report-rail-head">
          <div className="min-w-0">
            <p className="eyebrow">Event reports</p>
            {event ? (
              <>
                <h2 className="truncate font-display text-xl text-ink">
                  {event.title}
                </h2>
                <p className="text-sm text-ink-2">
                  {event.eventNumber} · {event.client}
                </p>
              </>
            ) : (
              <p className="text-base text-ink-2">
                Pick an event on the calendar to load its reports.
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {event ? (
              <Link
                to={eventDetailPath(event.id)}
                className="btn btn-ghost btn-sm"
              >
                Open event
              </Link>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={close}
              aria-label="Close reports"
            >
              ✕
            </button>
          </div>
        </header>

        {event && active ? (
          <EventReportView
            definition={active.definition}
            event={event}
            autoPrint={active.print}
            onBack={() => setActive(null)}
          />
        ) : event ? (
          <div className="home-report-list">
            {reports.length === 0 ? (
              <p className="home-report-note">
                Your list is empty. Choose the reports you print most.
              </p>
            ) : (
              <ul>
                {reports.map((definition) => (
                  <li key={definition.id}>
                    <div className="min-w-0">
                      <strong>{definition.name}</strong>
                      <span>{definition.description}</span>
                    </div>
                    <div className="home-report-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setActive({ definition, print: false })}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => setActive({ definition, print: true })}
                      >
                        Print
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="text-link mt-3 text-sm"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Done editing" : "Edit my report list"}
            </button>
            {editing ? (
              <ul className="home-report-picker">
                {EVENT_REPORTS.map((definition) => (
                  <li key={definition.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={reportIds.includes(definition.id)}
                        onChange={() => onToggleReport(definition.id)}
                      />
                      <span>{definition.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </aside>
    </>
  );
}
