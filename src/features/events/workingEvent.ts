import { useEffect, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { isPlausibleConvexId } from "../../lib/routeRecord";

/**
 * The working event: the one event the operator is busy with in this browser
 * tab. Opening an event, picking one on the calendar, or following a link
 * that names one sets it; other screens read it so they start on that event.
 * Session storage keeps it per tab, so two tabs can work two events.
 */
const STORAGE_KEY = "capsule.workingEvent";

export type ReportRailRequest = {
  eventId: string;
  /** null opens the report list; an id opens that report. */
  reportId: string | null;
  print: boolean;
};

const listeners = new Set<() => void>();
let memoryId: string | null = null;
let railRequest: ReportRailRequest | null = null;

function readId(): string | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? undefined;
    return isPlausibleConvexId(raw) ? raw : null;
  } catch {
    return memoryId;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

export function workingEventId(): string | null {
  return readId();
}

export function setWorkingEvent(id: string | null | undefined): void {
  const next = id != null && isPlausibleConvexId(id) ? id : null;
  if (next === readId()) return;
  memoryId = next;
  try {
    if (next) sessionStorage.setItem(STORAGE_KEY, next);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the working event lives in memory for this page load.
  }
  notify();
}

export function useWorkingEventId(): string | null {
  return useSyncExternalStore(subscribe, readId, () => null);
}

/** Opens the report rail on this event: its list, or one report. */
export function openEventReports(
  eventId: string,
  reportId: string | null = null,
  print = false,
): void {
  setWorkingEvent(eventId);
  railRequest = { eventId, reportId, print };
  notify();
}

/** The rail calls this once it has acted, so a remount never replays it. */
export function clearReportRailRequest(): void {
  if (railRequest === null) return;
  railRequest = null;
  notify();
}

export function useReportRailRequest(): ReportRailRequest | null {
  return useSyncExternalStore(
    subscribe,
    () => railRequest,
    () => null,
  );
}

const EVENT_ROUTE = /^\/(?:events|event-day)\/([^/]+)/;

/** /events/:id, /event-day/:id, or a ?event= / ?eventId= link. */
export function eventIdFromLocation(
  pathname: string,
  search: string,
): string | null {
  const fromPath = pathname.match(EVENT_ROUTE)?.[1];
  if (isPlausibleConvexId(fromPath)) return fromPath;
  const params = new URLSearchParams(search);
  const fromQuery = params.get("event") ?? params.get("eventId") ?? undefined;
  return isPlausibleConvexId(fromQuery) ? fromQuery : null;
}

/** Any route that names an event makes it the working event. */
export function WorkingEventRouteSync(): null {
  const { pathname, search } = useLocation();
  useEffect(() => {
    const id = eventIdFromLocation(pathname, search);
    if (id) setWorkingEvent(id);
  }, [pathname, search]);
  return null;
}
