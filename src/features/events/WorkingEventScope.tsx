import { useState } from "react";
import { useGetEvent } from "../../lib/manifest-convex-react";
import { useWorkingEventId } from "./workingEvent";

/**
 * List screens show only the working event's rows until the operator asks
 * for every event. "Show all events" is per screen; it never clears the
 * working event.
 */
export function useWorkingEventScope() {
  const workingId = useWorkingEventId();
  const [showAll, setShowAll] = useState(false);
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
