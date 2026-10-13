// PL-SCALE: one event list for a screen that has an event picker AND names the
// events its own rows point at. Picker window plus those named events (an old
// event on a row, or the one currently selected, still shows). Replaces the
// every-event useListEvent on those screens.
// The tab's working event is always named too (#430): an event older than the
// picker window can be picked on any form once it is open in the tab.
import { useMemo } from "react";
import { useWorkingEventId } from "../events/workingEvent";
import {
  useEventsById,
  usePickerEvents,
  type EventLookupRow,
} from "./useEventsById";

const DAY = 86_400_000;
/** "past": the last 30 days and today, for work already done (tips, closeout, hours).
 * "upcoming": today to 60 days ahead, for work still ahead
 * (packing, rosters, purchasing). The events the rows name always stay. */
export type PickerWhen = "past" | "upcoming";

/**
 * Whether a picker of this kind offers the event. Screens filter their
 * pick list with it: the hook's result also holds the events the rows name
 * (old ones too), which are there to name rows, not to be picked.
 */
export function inPickerWindow(
  event: Pick<EventLookupRow, "startsAt">,
  when: PickerWhen | undefined,
  now = Date.now(),
) {
  if (!when) return true;
  const startsAt = event.startsAt;
  if (startsAt == null) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  if (when === "past")
    return startsAt < today.getTime() + DAY && startsAt > now - 30 * DAY;
  return startsAt >= today.getTime() && startsAt < now + 60 * DAY;
}

/**
 * `ids` are the event ids the screen's rows (and its selection) name; pass
 * `undefined` while those rows are still loading. `undefined` result while
 * loading.
 */
export function usePickerAndNamedEvents(
  ids: ReadonlyArray<string | null | undefined> | undefined,
  when?: PickerWhen,
): EventLookupRow[] | undefined {
  const picker = usePickerEvents();
  const workingId = useWorkingEventId();
  const withWorking = useMemo(
    () => (ids === undefined ? undefined : [workingId, ...ids]),
    [ids, workingId],
  );
  const named = useEventsById(withWorking);
  return useMemo(() => {
    if (picker === undefined || named === undefined) return undefined;
    // The old every-event list left removed events out; so does this one.
    // Closest to today first, so a picker opens on the events being worked.
    const now = Date.now();
    const shown = picker.filter((event) => inPickerWindow(event, when));
    const seen = new Set<string>(shown.map((event) => event._id));
    const distance = (event: EventLookupRow) =>
      Math.abs(Number(event.startsAt ?? 0) - now);
    return [
      ...shown,
      ...named.filter(
        (event) => !seen.has(event._id) && event.deletedAt == null,
      ),
    ].sort((a, b) => distance(a) - distance(b));
  }, [picker, named, when]);
}
