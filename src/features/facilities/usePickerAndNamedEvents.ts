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

/**
 * `ids` are the event ids the screen's rows (and its selection) name; pass
 * `undefined` while those rows are still loading. `undefined` result while
 * loading.
 */
export function usePickerAndNamedEvents(
  ids: ReadonlyArray<string | null | undefined> | undefined,
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
    const seen = new Set<string>(picker.map((event) => event._id));
    // The old every-event list left removed events out; so does this one.
    // Closest to today first, so a picker opens on the events being worked.
    const now = Date.now();
    const distance = (event: EventLookupRow) =>
      Math.abs(Number(event.startsAt ?? 0) - now);
    return [
      ...picker,
      ...named.filter(
        (event) => !seen.has(event._id) && event.deletedAt == null,
      ),
    ].sort((a, b) => distance(a) - distance(b));
  }, [picker, named]);
}
