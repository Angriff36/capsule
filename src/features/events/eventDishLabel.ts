/**
 * The dish name to print on an event menu line, in truth order: the name
 * snapshot the line stored when the dish was added (a later catalog rename
 * must not retroactively change the booked menu), then the live dish record
 * for legacy lines with a dish but no snapshot, then an honest loading or
 * unavailable word. A line with no dish at all prints "Unknown dish".
 */
export function eventDishLabel(input: {
  dishId?: string | null;
  dishName?: string | null;
  liveName: string;
  dishesLoading: boolean;
}): string {
  const snapshot = input.dishName?.trim();
  if (snapshot) return snapshot;
  const liveName = input.liveName.trim();
  if (liveName && liveName !== "Unknown dish") return liveName;
  if (input.dishId) {
    return input.dishesLoading ? "Loading dish…" : "Dish unavailable";
  }
  return "Unknown dish";
}
