/**
 * Trip check: what the driver found on a truck before it left for an event
 * and after it came back. Pure reading of saved checks; a new check takes the
 * place of the old one on screen and the old one stays as history.
 */

export type TripCheckKind = "before_leaving" | "after_return";
export type TripCheckRating = "good" | "fair" | "poor" | "fail";
export type TripFuelLevel =
  "empty" | "quarter" | "half" | "three_quarters" | "full";

export const TRIP_CHECK_ITEMS = [
  ["tires", "Tires"],
  ["brakes", "Brakes"],
  ["lights", "Lights"],
  ["fluids", "Fluids"],
  ["bodywork", "Body"],
  ["interior", "Cab"],
] as const;

export type TripCheckItemKey = (typeof TRIP_CHECK_ITEMS)[number][0];

export const TRIP_CHECK_RATINGS: [TripCheckRating, string][] = [
  ["good", "Good"],
  ["fair", "Fair"],
  ["poor", "Poor"],
  ["fail", "Not safe"],
];

export const TRIP_FUEL_LEVELS: [TripFuelLevel, string][] = [
  ["full", "Full"],
  ["three_quarters", "3/4"],
  ["half", "1/2"],
  ["quarter", "1/4"],
  ["empty", "Empty"],
];

export const TRIP_CHECK_KIND_LABEL: Record<TripCheckKind, string> = {
  before_leaving: "Before leaving",
  after_return: "After return",
};

export type TripCheckRow = {
  _id: string;
  deletedAt?: number | null;
  eventVehicleAssignmentId: string;
  eventId?: string | null;
  kind: TripCheckKind;
  tires: TripCheckRating;
  brakes: TripCheckRating;
  lights: TripCheckRating;
  fluids: TripCheckRating;
  bodywork: TripCheckRating;
  interior: TripCheckRating;
  refrigeration?: TripCheckRating | null;
  odometer?: number | null;
  fuelLevel?: TripFuelLevel | null;
  damageNote?: string | null;
  notes?: string | null;
  checkedAt?: number | null;
  checkedByPersonId?: string | null;
};

/** Names of the items marked "Not safe" on one check. */
export function tripCheckFailures(row: TripCheckRow): string[] {
  const failed: string[] = TRIP_CHECK_ITEMS.filter(
    ([key]) => row[key] === "fail",
  ).map(([, label]) => label);
  if (row.refrigeration === "fail") failed.push("Fridge unit");
  return failed;
}

/** Items marked "Poor": worth a look, the truck may still go. */
export function tripCheckWarnings(row: TripCheckRow): string[] {
  const poor: string[] = TRIP_CHECK_ITEMS.filter(
    ([key]) => row[key] === "poor",
  ).map(([, label]) => label);
  if (row.refrigeration === "poor") poor.push("Fridge unit");
  return poor;
}

export function tripCheckPassed(row: TripCheckRow): boolean {
  return tripCheckFailures(row).length === 0;
}

/** The newest saved check of one kind for one truck run, or nothing. */
export function latestTripCheck(
  rows: readonly TripCheckRow[],
  runId: string,
  kind: TripCheckKind,
): TripCheckRow | undefined {
  let latest: TripCheckRow | undefined;
  for (const row of rows) {
    if (
      row.deletedAt != null ||
      row.checkedAt == null ||
      row.kind !== kind ||
      String(row.eventVehicleAssignmentId) !== runId
    )
      continue;
    if (!latest || Number(row.checkedAt) > Number(latest.checkedAt))
      latest = row;
  }
  return latest;
}

/** Miles driven on the trip, when both readings exist and make sense. */
export function tripMiles(
  before: TripCheckRow | undefined,
  after: TripCheckRow | undefined,
): number | null {
  if (before?.odometer == null || after?.odometer == null) return null;
  const miles = after.odometer - before.odometer;
  return miles >= 0 ? miles : null;
}

export function fuelLevelLabel(level: TripFuelLevel | null | undefined) {
  return TRIP_FUEL_LEVELS.find(([key]) => key === level)?.[1] ?? null;
}
