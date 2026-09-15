import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { TPP_REPORT_CATALOG } from "../reports/tpp/catalog";
import type { TppReportDefinition } from "../reports/tpp/types";
import { eventDetailPath } from "../events/eventRoutes";
import {
  clearReportRailRequest,
  type ReportRailRequest,
} from "../events/workingEvent";
import { EventReportView } from "./EventReportView";
import type { CalendarEventFacts } from "./homeCalendar";
import "./EventReportRail.css";

const STORAGE_KEY = "capsule.eventReportRail.reports";
const LIST_CHANGED = "capsule:event-report-list";

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

/** What the rail needs to know about an event. */
export type ReportRailEvent = Pick<
  CalendarEventFacts,
  "id" | "title" | "eventNumber" | "client" | "startsAt" | "endsAt"
>;

type Active = { definition: TppReportDefinition; print: boolean };

type ListChange = { scope: string; ids: string[] };

export function useEventReportList(storageScope: string) {
  const [ids, setIds] = useState<string[]>(
    () => readStoredIds(storageScope) ?? DEFAULT_REPORT_IDS,
  );

  useEffect(() => {
    setIds(readStoredIds(storageScope) ?? DEFAULT_REPORT_IDS);
  }, [storageScope]);

  // Home's tooltip and the shell rail each hold a copy of the list; an edit
  // in one must reach the other.
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<ListChange>).detail;
      if (detail?.scope === storageScope) setIds(detail.ids);
    };
    window.addEventListener(LIST_CHANGED, onChange);
    return () => window.removeEventListener(LIST_CHANGED, onChange);
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
    const next = ids.includes(id)
      ? ids.filter((entry) => entry !== id)
      : [...ids, id];
    writeStoredIds(storageScope, next);
    window.dispatchEvent(
      new CustomEvent<ListChange>(LIST_CHANGED, {
        detail: { scope: storageScope, ids: next },
      }),
    );
  };

  return { ids, chosen, toggle };
}

/**
 * The tab pinned to the right edge of every screen. It carries the report
 * list for the working event: view a report in place, or print it straight
 * away. The list is the operator's own — edit it once and the browser
 * remembers.
 */
export function EventReportRail({
  event,
  reportIds,
  reports,
  onToggleReport,
  request,
}: {
  event: ReportRailEvent | null;
  reportIds: readonly string[];
  reports: readonly TppReportDefinition[];
  onToggleReport: (id: string) => void;
  request: ReportRailRequest | null;
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

  // A new event resets the rail to its list. It stays closed unless asked:
  // opening an event page must not throw the drawer over it.
  const eventId = event?.id ?? null;
  useEffect(() => {
    setActive(null);
  }, [eventId]);

  // The rail sits in the shell now: leaving a screen (a calendar double-click
  // opens the event page) closes it. Declared before the request effect so a
  // request on the same render still opens it.
  const { pathname } = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // A request (calendar pick, tooltip View / Print) is acted on once and
  // cleared, so a later remount never replays it or reopens the print dialog.
  useEffect(() => {
    if (!request || !event || request.eventId !== event.id) return;
    clearReportRailRequest();
    const definition = request.reportId
      ? EVENT_REPORTS.find((candidate) => candidate.id === request.reportId)
      : undefined;
    setActive(definition ? { definition, print: request.print } : null);
    setOpen(true);
  }, [event, request]);

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
