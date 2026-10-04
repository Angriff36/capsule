export type KitchenStationOption = {
  _id: string;
  name: string;
  sortOrder?: number | null;
  aliases?: readonly (string | null)[] | null;
  status: string;
  definedAt?: number | null;
  deletedAt?: number | null;
};

const key = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();

/** Active kitchen stations in printed-sheet order. */
export function activeKitchenStations(
  stations: readonly KitchenStationOption[] | undefined,
) {
  return (stations ?? [])
    .filter(
      (station) =>
        station.deletedAt == null &&
        station.definedAt != null &&
        station.status === "active",
    )
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );
}

/**
 * The station name a recipe step stores. A typed name or a saved other
 * spelling of an active kitchen station becomes that station's own name, so
 * prep sheets group the step with the rest of that station's work. Anything
 * else is kept as typed: a kitchen with no station list still works.
 */
export function kitchenStationName(
  typed: string,
  stations: readonly KitchenStationOption[] | undefined,
): string | undefined {
  const wanted = key(typed);
  if (!wanted) return undefined;
  const match = activeKitchenStations(stations).find(
    (station) =>
      key(station.name) === wanted ||
      (station.aliases ?? []).some(
        (alias) => alias != null && key(alias) === wanted,
      ),
  );
  return match ? match.name : typed.trim();
}
