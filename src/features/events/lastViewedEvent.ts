import { isPlausibleConvexId } from "../../lib/routeRecord";
import { eventsIndexPath } from "./eventRoutes";

const STORAGE_KEY = "capsule.lastViewedEvent";

function pathnameOf(path: string): string {
  return path.split("?")[0] ?? path;
}

/** True for /events/:convexId — not the list, not /events/new. */
export function isEventDetailPath(path: string): boolean {
  const match = pathnameOf(path).match(/^\/events\/([^/]+)$/);
  return Boolean(match && isPlausibleConvexId(match[1]));
}

/**
 * List + other workspaces must stay put. Last-viewed is a memory of an
 * event the user actually opened, not a rewrite target for /kitchen,
 * /facilities, or a typed /events index.
 */
export function isProtectedFromLastViewedRestore(path: string): boolean {
  const pathname = pathnameOf(path);
  if (pathname === eventsIndexPath()) return true;
  if (
    pathname === "/events/new" ||
    pathname === "/events/templates" ||
    pathname === "/events/capacity"
  ) {
    return true;
  }
  if (pathname === "/kitchen" || pathname.startsWith("/kitchen/")) return true;
  if (pathname === "/facilities" || pathname.startsWith("/facilities/")) {
    return true;
  }
  return false;
}

export function rememberLastViewedEvent(path: string): void {
  if (typeof sessionStorage === "undefined") return;
  if (!isEventDetailPath(path)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // Private mode — last-viewed just will not persist.
  }
}

export function lastViewedEventPath(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw || !isEventDetailPath(raw)) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Visiting a protected route never becomes the last-viewed event URL. */
export function locationAfterLastViewedRestore(requestedPath: string): string {
  if (isProtectedFromLastViewedRestore(requestedPath)) {
    return pathnameOf(requestedPath) === eventsIndexPath()
      ? eventsIndexPath()
      : requestedPath;
  }
  return requestedPath;
}
