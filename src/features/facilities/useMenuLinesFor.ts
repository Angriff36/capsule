// Seam hooks for convex/eventMenuLookup.ts (PL-SCALE). Live in facilities
// (the unguarded seam-hook home) because the feature guards forbid
// convex/react in their own directories. Screens that look at a week, one
// event or one dish read those menu lines instead of the generated
// every-event list, which reads every line of every event with its recipe.
import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import type { Doc } from "../../../convex/_generated/dataModel";

/**
 * Live menu lines of these events (the first 500 ids; put the ones the
 * screen needs most first). `undefined` while the ids or the lines are
 * loading; `[]` when the caller may not read them.
 */
export function useMenuLinesForEvents(
  eventIds: ReadonlyArray<string | null | undefined> | undefined,
): Doc<"eventDishes">[] | undefined {
  const ids = useMemo(
    () =>
      eventIds === undefined
        ? undefined
        : [...new Set(eventIds.filter((id): id is string => !!id))],
    [eventIds],
  );
  const rows = useQuery(
    api.eventMenuLookup.forEvents,
    ids === undefined || ids.length === 0 ? "skip" : { eventIds: ids },
  );
  if (ids === undefined) return undefined;
  if (ids.length === 0) return [];
  if (rows === undefined) return undefined;
  return rows ?? [];
}

/** Live menu lines that serve this dish. Same loading rules. */
export function useMenuLinesForDish(
  dishId: string | null | undefined,
): Doc<"eventDishes">[] | undefined {
  const rows = useQuery(
    api.eventMenuLookup.forDish,
    dishId ? { dishId } : "skip",
  );
  if (!dishId) return [];
  if (rows === undefined) return undefined;
  return rows ?? [];
}
