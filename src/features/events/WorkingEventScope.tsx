import { useState } from "react";
import { useGetEvent } from "../../lib/manifest-convex-react";
import { useWorkingEventId } from "./workingEvent";

const SHOW_ALL_KEY = "capsule.showAllEvents.";

function readShowAll(screen: string): boolean {
  try {
    return sessionStorage.getItem(SHOW_ALL_KEY + screen) === "1";
  } catch {
    return false;
  }
}

/**
 * List screens show only the working event's rows until the operator asks
 * for every event. "Show all events" is per screen and kept for the browser
 * tab (#374), so a return visit shows what the operator last chose; it never
 * clears the working event.
 */
export function useWorkingEventScope(screen: string) {
  const workingId = useWorkingEventId();
  const [showAll, setShowAllState] = useState(() => readShowAll(screen));
  const setShowAll = (next: boolean) => {
    setShowAllState(next);
    try {
      if (next) sessionStorage.setItem(SHOW_ALL_KEY + screen, "1");
      else sessionStorage.removeItem(SHOW_ALL_KEY + screen);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
  };
  return {
    workingId,
    /** The event to filter by, or null for every event. */
    scopeId: showAll ? null : workingId,
    showAll,
    setShowAll,
  };
}

export type WorkingEventScope = ReturnType<typeof useWorkingEventScope>;

export function WorkingEventScopeNote({
  scope,
  noun,
}: {
  scope: WorkingEventScope;
  /** Plural rows the list holds, e.g. "pack lists". */
  noun: string;
}) {
  const event = useGetEvent(scope.workingId ?? "skip");
  if (!scope.workingId) return null;
  const title = event?.title ?? "the working event";
  return (
    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
      {scope.showAll ? (
        <span>Showing {noun} for every event.</span>
      ) : (
        <span>
          Showing {noun} for <strong className="text-ink">{title}</strong>.
        </span>
      )}
      <button
        type="button"
        className="text-link"
        onClick={() => scope.setShowAll(!scope.showAll)}
      >
        {scope.showAll ? `Only ${title}` : "Show all events"}
      </button>
    </p>
  );
}
