// Venue logistics profile (site survey): the facts a crew needs before it
// arrives at a venue. One list feeds the venue page, every event at the
// venue, and the BEO, so all three say the same thing.
import {
  loadWindowLabel,
  type VenueOperatingFacts,
} from "./venueOperatingFacts";

export type VenueLogisticsProfile = VenueOperatingFacts & {
  readonly loadingDock?: string | null;
  readonly elevatorNotes?: string | null;
  readonly kitchenEquipment?: string | null;
  readonly powerDetails?: string | null;
  readonly parkingDetails?: string | null;
  readonly arrivalRestrictions?: string | null;
  readonly dayOfContactName?: string | null;
  readonly dayOfContactPhone?: string | null;
  readonly hasFreightElevator?: boolean | null;
  readonly powerAvailable?: boolean | null;
  readonly parkingAvailable?: boolean | null;
  readonly kitchenAccess?: string | null;
  readonly loadInInstructions?: string | null;
};

/** The free-text fields setLogisticsProfile writes, in form order. */
export const VENUE_LOGISTICS_FIELDS = [
  {
    name: "loadingDock",
    label: "Loading dock access",
    hint: "Where the dock is, height, how to book it",
  },
  {
    name: "elevatorNotes",
    label: "Elevator",
    hint: "Freight or passenger, size, who holds the key",
  },
  {
    name: "kitchenEquipment",
    label: "Onsite kitchen equipment",
    hint: "Ovens, burners, fridge space, prep tables, sinks",
  },
  {
    name: "powerDetails",
    label: "Power",
    hint: "Outlets near service, amps, shared circuits, generator",
  },
  {
    name: "parkingDetails",
    label: "Parking",
    hint: "Where vans park, permits, distance to the door",
  },
  {
    name: "arrivalRestrictions",
    label: "Arrival restrictions",
    hint: "Earliest arrival, quiet hours, doors to use or avoid",
  },
] as const;

export type VenueLogisticsFieldName =
  | (typeof VENUE_LOGISTICS_FIELDS)[number]["name"]
  | "dayOfContactName"
  | "dayOfContactPhone";

export type VenueLogisticsArgs = Partial<
  Record<VenueLogisticsFieldName, string>
>;

/** Form values -> command args. A blank field clears that fact. */
export function logisticsArgsFromForm(
  read: (name: VenueLogisticsFieldName) => string,
): VenueLogisticsArgs {
  const args: VenueLogisticsArgs = {};
  const names: VenueLogisticsFieldName[] = [
    ...VENUE_LOGISTICS_FIELDS.map((field) => field.name),
    "dayOfContactName",
    "dayOfContactPhone",
  ];
  for (const name of names) {
    const value = read(name).trim();
    if (value) args[name] = value;
  }
  return args;
}

const clean = (value: string | null | undefined) => value?.trim() || null;

const yesNo = (value: boolean | null | undefined, yes: string, no: string) =>
  value == null ? null : value ? yes : no;

const joined = (...parts: Array<string | null>) =>
  parts.filter((part): part is string => Boolean(part)).join(". ") || null;

export type VenueLogisticsLine = { label: string; value: string };

/** The profile as labelled lines; facts not on file are left out. */
export function venueLogisticsLines(
  venue: VenueLogisticsProfile,
): VenueLogisticsLine[] {
  const contact = [
    clean(venue.dayOfContactName),
    clean(venue.dayOfContactPhone),
  ]
    .filter(Boolean)
    .join(" · ");
  const lines: Array<[string, string | null]> = [
    ["Day-of access contact", contact || null],
    [
      "Arrival",
      joined(loadWindowLabel(venue), clean(venue.arrivalRestrictions)),
    ],
    [
      "Loading dock access",
      joined(clean(venue.loadingDock), clean(venue.loadInInstructions)),
    ],
    [
      "Elevator",
      joined(
        yesNo(
          venue.hasFreightElevator,
          "Freight elevator",
          "No freight elevator",
        ),
        clean(venue.elevatorNotes),
      ),
    ],
    [
      "Onsite kitchen",
      joined(
        clean(venue.kitchenAccess),
        yesNo(venue.hasOven, "Oven on site", "No oven"),
        yesNo(venue.hasRefrigeration, "Fridge on site", "No fridge"),
        clean(venue.kitchenEquipment),
      ),
    ],
    [
      "Power",
      joined(
        yesNo(venue.powerAvailable, "Power available", "No power on site"),
        clean(venue.powerDetails),
      ),
    ],
    [
      "Parking",
      joined(
        yesNo(venue.parkingAvailable, "Parking available", "No parking"),
        clean(venue.parkingDetails),
      ),
    ],
  ];
  return lines
    .filter((line): line is [string, string] => line[1] != null)
    .map(([label, value]) => ({ label, value }));
}
