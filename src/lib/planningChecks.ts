import {
  parseNeeds,
  parseSupplies,
  unmetNeeds,
  type PlannedPiece,
} from "./planningCapabilities";

/**
 * Planning board checks: everything wrong or unknown about one event's plan
 * (crew, trucks, trailers, equipment), read from the real records. Pure.
 *
 * A check never stops a save. Each one has a level the company sets:
 * "fix" (fix first: the board asks for a reason before it saves a change
 * that leaves one open), "look" (worth a look) or "off".
 */

export type PlanCheck =
  | "timing"
  | "double_booked"
  | "not_available"
  | "amount"
  | "driver"
  | "certificate"
  | "seats"
  | "load"
  | "towing"
  | "supply"
  | "goes_with"
  | "crew"
  | "trucks"
  | "unplanned";

export type PlanLevel = "fix" | "look" | "off";

export const PLAN_CHECKS: ReadonlyArray<{
  key: PlanCheck;
  label: string;
  hint: string;
  level: PlanLevel;
}> = [
  {
    key: "timing",
    label: "Event times",
    hint: "The event has no start or end time, or it ends before it starts.",
    level: "fix",
  },
  {
    key: "double_booked",
    label: "Booked twice",
    hint: "A person, truck, trailer or piece of equipment is on two events at the same time, counting load, drive, setup and the trip back.",
    level: "fix",
  },
  {
    key: "not_available",
    label: "Not available",
    hint: "A person has time off, or a truck, trailer or piece of equipment is in the shop, out of service or retired.",
    level: "fix",
  },
  {
    key: "amount",
    label: "More than we own",
    hint: "More of an item is held than the company has.",
    level: "fix",
  },
  {
    key: "driver",
    label: "Driver",
    hint: "A truck on the event has no driver.",
    level: "fix",
  },
  {
    key: "certificate",
    label: "Certificates",
    hint: "A driver or crew member does not hold the certificate the truck or the position asks for.",
    level: "fix",
  },
  {
    key: "seats",
    label: "Seats",
    hint: "More people ride in a truck than it has seats.",
    level: "fix",
  },
  {
    key: "load",
    label: "Truck load",
    hint: "The pack lines on a truck weigh more than it can carry, or take more space than it has.",
    level: "fix",
  },
  {
    key: "towing",
    label: "Towing",
    hint: "A trailer has no truck, its hitch does not fit the truck, or it weighs more than the truck can pull.",
    level: "fix",
  },
  {
    key: "supply",
    label: "Power, fuel and water",
    hint: "A piece of equipment needs something nothing on the event supplies.",
    level: "fix",
  },
  {
    key: "goes_with",
    label: "Parts that go with it",
    hint: "An item is on the event without the parts that always go with it.",
    level: "look",
  },
  {
    key: "crew",
    label: "Crew positions",
    hint: "A crew position on the event is not filled.",
    level: "look",
  },
  {
    key: "trucks",
    label: "Trucks needed",
    hint: "The event has fewer trucks than it says it needs.",
    level: "look",
  },
  {
    key: "unplanned",
    label: "Missing facts",
    hint: "Something the board needs is not recorded: the event's timing, a truck's seats, a towing limit.",
    level: "look",
  },
];

export type PlanLevels = Record<PlanCheck, PlanLevel>;

export function defaultPlanLevels(): PlanLevels {
  return Object.fromEntries(
    PLAN_CHECKS.map((check) => [check.key, check.level]),
  ) as PlanLevels;
}

/** The company's saved levels over the defaults; bad input is ignored. */
export function parsePlanLevels(json: string | null | undefined): PlanLevels {
  const levels = defaultPlanLevels();
  if (!json) return levels;
  try {
    const saved = JSON.parse(json) as Record<string, unknown>;
    for (const check of PLAN_CHECKS) {
      const value = saved[check.key];
      if (value === "fix" || value === "look" || value === "off")
        levels[check.key] = value;
    }
  } catch {
    // Unreadable settings fall back to the defaults.
  }
  return levels;
}

/** Only the levels that differ from the defaults, or nothing. */
export function planLevelsJson(levels: PlanLevels): string | undefined {
  const changed = PLAN_CHECKS.filter(
    (check) => levels[check.key] !== check.level,
  ).map((check) => [check.key, levels[check.key]]);
  return changed.length > 0
    ? JSON.stringify(Object.fromEntries(changed))
    : undefined;
}

export type PlanSubject =
  "event" | "person" | "truck" | "trailer" | "equipment";

export type PlanIssue = {
  key: string;
  check: PlanCheck;
  level: "fix" | "look";
  text: string;
  /** What to do about it. */
  fix: string;
  subject: PlanSubject;
  /** The person, truck, trailer or equipment item; the event for "event". */
  subjectId: string;
};

export type PlanStatus = "ready" | "look" | "fix";

// --- The rows the checks read (only the fields they use). ------------------

export type PlanEvent = {
  _id: string;
  title: string;
  stage: string;
  startsAt?: number | null;
  endsAt?: number | null;
  serviceStartsAt?: number | null;
  expectedHeadcount?: number | null;
  timingConfiguredAt?: number | null;
  timingSetupMinutes?: number | null;
  timingLoadMinutes?: number | null;
  timingOutboundTravelMinutes?: number | null;
  timingCleanupMinutes?: number | null;
  timingReturnTravelMinutes?: number | null;
  timingUnloadMinutes?: number | null;
  timingSafetyBufferMinutes?: number | null;
  timingBriefingMinutes?: number | null;
  deletedAt?: number | null;
};

export type PlanAssignment = {
  _id: string;
  eventId: string;
  personId: string;
  role: string;
  status: string;
  startsAt?: number | null;
  endsAt?: number | null;
  rideVehicleAssignmentId?: string | null;
  deletedAt?: number | null;
};

export type PlanStaffNeed = {
  _id: string;
  eventId: string;
  role: string;
  status: string;
  qualificationName?: string | null;
  filledByPersonId?: string | null;
  deletedAt?: number | null;
};

export type PlanRig = {
  _id: string;
  eventId: string;
  activeEventId?: string | null;
  vehicleId?: string | null;
  trailerId?: string | null;
  driverId?: string | null;
  vendorName?: string | null;
  arriveBeforeServeMinutes?: number | null;
  loadMinutes?: number | null;
  leaveAfterMinutes?: number | null;
  deletedAt?: number | null;
};

export type PlanVehicle = {
  _id: string;
  make: string;
  model: string;
  registration: string;
  operationalStatus: string;
  payloadCapacityKg: number;
  towCapacityKg?: number | null;
  seatCount?: number | null;
  driverQualificationName?: string | null;
  cargoVolumeM3?: number | null;
  hitchType?: string | null;
  deletedAt?: number | null;
};

export type PlanTrailer = {
  _id: string;
  make: string;
  model: string;
  registration: string;
  operationalStatus: string;
  payloadCapacityKg: number;
  cargoVolumeM3?: number | null;
  hitchType?: string | null;
  emptyWeightKg?: number | null;
  deletedAt?: number | null;
};

export type PlanPerson = {
  _id: string;
  givenName?: string | null;
  familyName?: string | null;
  status: string;
  deletedAt?: number | null;
};

export type PlanAway = {
  personId: string;
  startsAt?: number | null;
  endsAt?: number | null;
  /** Time off: "approved". Availability window: "active". */
  status: string;
  /** Availability windows only: "unavailable" blocks time. */
  kind?: string | null;
  deletedAt?: number | null;
};

export type PlanQualification = {
  personId: string;
  name: string;
  status: string;
  expiresAt?: number | null;
  deletedAt?: number | null;
};

export type PlanEquipment = {
  _id: string;
  name: string;
  quantity: number;
  condition: string;
  status: string;
  category?: string | null;
  providesJson?: string | null;
  needsJson?: string | null;
  deletedAt?: number | null;
};

export type PlanReservation = {
  _id: string;
  equipmentId: string;
  eventId: string;
  quantity: number;
  status: string;
  startsAt?: number | null;
  endsAt?: number | null;
  deletedAt?: number | null;
};

export type PlanPart = {
  equipmentId: string;
  partEquipmentId: string;
  role: string;
  quantity: number;
  removedAt?: number | null;
  deletedAt?: number | null;
};

export type PlanEquipmentIssue = {
  equipmentId?: string | null;
  quantity: number;
  holdsUnits: boolean;
  status: string;
  deletedAt?: number | null;
};

export type PlanPackList = {
  _id: string;
  eventId: string;
  status: string;
  deletedAt?: number | null;
};

export type PlanPackLine = {
  packListId: string;
  requiredQuantity: number;
  unitWeightKg?: number | null;
  unitVolumeM3?: number | null;
  loadAssignmentId?: string | null;
  listedAt?: number | null;
  retiredAt?: number | null;
  excludedAt?: number | null;
  deletedAt?: number | null;
};

export type PlanNeeds = {
  _id?: string;
  version?: number;
  eventId: string;
  trucksNeeded?: number | null;
  siteProvidesJson?: string | null;
  deletedAt?: number | null;
};

export type PlanSnapshot = {
  events: readonly PlanEvent[];
  assignments: readonly PlanAssignment[];
  staffNeeds: readonly PlanStaffNeed[];
  rigs: readonly PlanRig[];
  vehicles: readonly PlanVehicle[];
  trailers: readonly PlanTrailer[];
  people: readonly PlanPerson[];
  timeOff: readonly PlanAway[];
  availability: readonly PlanAway[];
  qualifications: readonly PlanQualification[];
  equipment: readonly PlanEquipment[];
  reservations: readonly PlanReservation[];
  parts: readonly PlanPart[];
  equipmentIssues: readonly PlanEquipmentIssue[];
  packLists: readonly PlanPackList[];
  packLines: readonly PlanPackLine[];
  planNeeds: readonly PlanNeeds[];
};

const MINUTE = 60_000;
const DONE_STAGES = new Set(["cancelled", "completed", "closed_out"]);
const LIVE_HOLDS = new Set(["reserved", "checked_out"]);
const OFF_CREW = new Set(["unassigned", "no_show"]);

const minutes = (value: number | null | undefined) =>
  (Number(value) || 0) * MINUTE;

export type Window = { start: number; end: number };

const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;

/** An event that still takes crew, trucks and equipment. */
export function isLiveEvent(event: PlanEvent): boolean {
  return event.deletedAt == null && !DONE_STAGES.has(event.stage);
}

/**
 * From loading the truck to unloading it back at the kitchen: the time the
 * event holds its crew, trucks and equipment. With no timing planned it is
 * the event's own start and end. Nothing with a bad or missing time.
 */
export function eventWindow(event: PlanEvent): Window | null {
  const { startsAt, endsAt } = event;
  if (startsAt == null || endsAt == null || endsAt <= startsAt) return null;
  const serve = event.serviceStartsAt ?? startsAt;
  const out =
    serve -
    minutes(event.timingSetupMinutes) -
    minutes(event.timingOutboundTravelMinutes) -
    minutes(event.timingSafetyBufferMinutes) -
    minutes(event.timingLoadMinutes) -
    minutes(event.timingBriefingMinutes);
  const back =
    endsAt +
    minutes(event.timingCleanupMinutes) +
    minutes(event.timingReturnTravelMinutes) +
    minutes(event.timingUnloadMinutes);
  return { start: Math.min(out, startsAt), end: Math.max(back, endsAt) };
}

/** One truck run's own time: a drop run frees the truck early. */
export function rigWindow(event: PlanEvent, rig: PlanRig): Window | null {
  const whole = eventWindow(event);
  if (!whole) return null;
  const serve = event.serviceStartsAt ?? event.startsAt!;
  const arrive =
    serve -
    (rig.arriveBeforeServeMinutes != null
      ? minutes(rig.arriveBeforeServeMinutes)
      : minutes(event.timingSetupMinutes));
  const start =
    arrive -
    minutes(event.timingOutboundTravelMinutes) -
    minutes(event.timingSafetyBufferMinutes) -
    (rig.loadMinutes != null
      ? minutes(rig.loadMinutes)
      : minutes(event.timingLoadMinutes));
  const end =
    rig.leaveAfterMinutes != null
      ? arrive +
        minutes(rig.leaveAfterMinutes) +
        minutes(event.timingReturnTravelMinutes)
      : whole.end;
  return { start: Math.min(start, arrive), end: Math.max(end, arrive) };
}

export function personName(person: PlanPerson | undefined): string {
  const name = `${person?.givenName ?? ""} ${person?.familyName ?? ""}`.trim();
  return name || "A crew member";
}

export function rigName(
  row: { make: string; model: string; registration: string } | undefined,
  fallback: string,
): string {
  if (!row) return fallback;
  const name = `${row.make} ${row.model}`.trim();
  return row.registration ? `${name} · ${row.registration}` : name || fallback;
}

const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase() &&
  (a ?? "").trim() !== "";

const when = (at: number) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

const shown = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));

/** Every open item on one event's plan, "fix first" before "worth a look". */
export function checkEventPlan(
  snap: PlanSnapshot,
  eventId: string,
  levels: PlanLevels,
): PlanIssue[] {
  const event = snap.events.find((row) => row._id === eventId);
  if (!event || event.deletedAt != null) return [];
  const issues: PlanIssue[] = [];
  const add = (
    check: PlanCheck,
    subject: PlanSubject,
    subjectId: string,
    text: string,
    fix: string,
  ) => {
    const level = levels[check];
    if (level === "off") return;
    issues.push({
      key: `${check}:${subject}:${subjectId}:${text}`,
      check,
      level,
      text,
      fix,
      subject,
      subjectId,
    });
  };

  const window = eventWindow(event);
  if (!window)
    add(
      "timing",
      "event",
      eventId,
      "This event has no start and end time.",
      "Set the date and times on the event.",
    );
  else if (event.timingConfiguredAt == null)
    add(
      "unplanned",
      "event",
      eventId,
      "Load, drive and setup times are not planned, so the board counts only the event's own start and end.",
      "Plan the timing on the event's Timeline page.",
    );

  const liveEvents = new Map(
    snap.events.filter(isLiveEvent).map((row) => [row._id, row]),
  );
  const otherEvent = (id: string) =>
    id !== eventId ? liveEvents.get(id) : undefined;
  const conflictName = (other: PlanEvent) =>
    `${other.title}${other.startsAt != null ? ` (${when(other.startsAt)})` : ""}`;

  // --- Crew -----------------------------------------------------------------
  const crewOn = (id: string) =>
    snap.assignments.filter(
      (row) =>
        row.deletedAt == null &&
        row.eventId === id &&
        !OFF_CREW.has(row.status),
    );
  const crew = crewOn(eventId);
  const personWindow = (row: PlanAssignment, of: PlanEvent): Window | null =>
    row.startsAt != null && row.endsAt != null && row.endsAt > row.startsAt
      ? { start: row.startsAt, end: row.endsAt }
      : eventWindow(of);

  for (const row of crew) {
    const person = snap.people.find((entry) => entry._id === row.personId);
    const name = personName(person);
    const mine = personWindow(row, event);
    if (person && (person.deletedAt != null || person.status !== "active"))
      add(
        "not_available",
        "person",
        row.personId,
        `${name} is not an active staff member.`,
        "Put someone else on the event.",
      );
    if (!mine) continue;
    const clashes = new Set<string>();
    for (const other of snap.assignments) {
      if (
        other.deletedAt != null ||
        other.personId !== row.personId ||
        OFF_CREW.has(other.status)
      )
        continue;
      const otherOf = otherEvent(other.eventId);
      if (!otherOf) continue;
      const theirs = personWindow(other, otherOf);
      if (theirs && overlaps(mine, theirs)) clashes.add(conflictName(otherOf));
    }
    if (clashes.size > 0)
      add(
        "double_booked",
        "person",
        row.personId,
        `${name} is also on ${[...clashes].join(", ")} at the same time.`,
        "Put someone else on one of the events, or change the times.",
      );
    const away = [
      ...snap.timeOff.filter((entry) => entry.status === "approved"),
      ...snap.availability.filter(
        (entry) => entry.status === "active" && entry.kind === "unavailable",
      ),
    ].some(
      (entry) =>
        entry.deletedAt == null &&
        entry.personId === row.personId &&
        entry.startsAt != null &&
        entry.endsAt != null &&
        overlaps(mine, { start: entry.startsAt, end: entry.endsAt }),
    );
    if (away)
      add(
        "not_available",
        "person",
        row.personId,
        `${name} has time off during this event.`,
        "Put someone else on the event, or check with them.",
      );
  }

  const holds = (personId: string, certificate: string, until: number) =>
    snap.qualifications.some(
      (entry) =>
        entry.deletedAt == null &&
        entry.personId === personId &&
        entry.status === "active" &&
        sameName(entry.name, certificate) &&
        (entry.expiresAt == null || entry.expiresAt >= until),
    );
  const until = window?.end ?? Date.now();

  const needs = snap.staffNeeds.filter(
    (row) => row.deletedAt == null && row.eventId === eventId,
  );
  const open = needs.filter(
    (row) => row.status === "open" || row.status === "claimed",
  );
  if (open.length > 0)
    add(
      "crew",
      "event",
      eventId,
      `${open.length} crew ${open.length === 1 ? "position is" : "positions are"} not filled: ${[...new Set(open.map((row) => row.role))].join(", ")}.`,
      "Fill the positions on the event's Staffing page.",
    );
  for (const need of needs) {
    const certificate = need.qualificationName?.trim();
    if (
      need.status === "filled" &&
      certificate &&
      need.filledByPersonId &&
      !holds(need.filledByPersonId, certificate, until)
    ) {
      const person = snap.people.find(
        (entry) => entry._id === need.filledByPersonId,
      );
      add(
        "certificate",
        "person",
        need.filledByPersonId,
        `${personName(person)} does not hold "${certificate}" for the ${need.role} position.`,
        "Fill the position with someone who holds it, or record their certificate.",
      );
    }
  }

  // --- Trucks and trailers ----------------------------------------------------
  const rigsOn = (id: string) =>
    snap.rigs.filter(
      (row) => row.deletedAt == null && row.activeEventId === id,
    );
  const rigs = rigsOn(eventId);
  const trucks = rigs.filter((row) => row.vehicleId != null);
  const wanted = snap.planNeeds.find(
    (row) => row.deletedAt == null && row.eventId === eventId,
  );
  if (wanted?.trucksNeeded != null && trucks.length < wanted.trucksNeeded)
    add(
      "trucks",
      "event",
      eventId,
      `This event needs ${wanted.trucksNeeded} ${wanted.trucksNeeded === 1 ? "truck" : "trucks"}; ${trucks.length} on it.`,
      "Put another truck on the event.",
    );

  const lists = new Set(
    snap.packLists
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.eventId === eventId &&
          row.status !== "cancelled",
      )
      .map((row) => row._id),
  );
  const lines = snap.packLines.filter(
    (row) =>
      row.deletedAt == null &&
      row.listedAt != null &&
      row.retiredAt == null &&
      row.excludedAt == null &&
      lists.has(row.packListId),
  );

  for (const rig of rigs) {
    const vehicle = snap.vehicles.find((row) => row._id === rig.vehicleId);
    const trailer = snap.trailers.find((row) => row._id === rig.trailerId);
    const mine = rigWindow(event, rig);

    for (const [kind, id, row, fallback] of [
      ["truck", rig.vehicleId, vehicle, "Truck"],
      ["trailer", rig.trailerId, trailer, "Trailer"],
    ] as const) {
      if (!id) continue;
      const name = rigName(row, fallback);
      if (
        row &&
        (row.deletedAt != null ||
          ["maintenance", "out_of_service", "retired"].includes(
            row.operationalStatus,
          ))
      )
        add(
          "not_available",
          kind,
          id,
          `${name} is ${row.deletedAt != null ? "removed from the fleet" : row.operationalStatus === "maintenance" ? "in the shop" : row.operationalStatus === "retired" ? "retired" : "out of service"}.`,
          `Put another ${kind} on the event, or update its status on the Fleet page.`,
        );
      if (!mine) continue;
      const clashes = new Set<string>();
      for (const other of snap.rigs) {
        if (other.deletedAt != null || other.activeEventId == null) continue;
        if ((kind === "truck" ? other.vehicleId : other.trailerId) !== id)
          continue;
        const otherOf = otherEvent(other.activeEventId);
        if (!otherOf) continue;
        const theirs = rigWindow(otherOf, other);
        if (theirs && overlaps(mine, theirs))
          clashes.add(conflictName(otherOf));
      }
      if (clashes.size > 0)
        add(
          "double_booked",
          kind,
          id,
          `${name} is also on ${[...clashes].join(", ")} at the same time.`,
          `Put another ${kind} on one of the events, or change the times.`,
        );
    }

    if (rig.trailerId && !rig.vehicleId && !rig.vendorName?.trim())
      add(
        "towing",
        "trailer",
        rig.trailerId,
        `${rigName(trailer, "Trailer")} has no truck to pull it.`,
        "Attach the trailer together with its truck on the event tracker.",
      );
    if (!vehicle || !rig.vehicleId) continue;
    const truckName = rigName(vehicle, "Truck");

    if (rig.trailerId) {
      if (vehicle.towCapacityKg === 0)
        add(
          "towing",
          "truck",
          rig.vehicleId,
          `${truckName} cannot pull a trailer.`,
          "Attach the trailer to a truck that can tow.",
        );
      else if (vehicle.towCapacityKg == null)
        add(
          "unplanned",
          "truck",
          rig.vehicleId,
          `${truckName} pulls a trailer, and its towing limit is not recorded.`,
          "Record the towing limit on the Fleet page.",
        );
      const hitch = vehicle.hitchType?.trim().toLowerCase();
      const coupler = trailer?.hitchType?.trim().toLowerCase();
      if (hitch && coupler && hitch !== coupler)
        add(
          "towing",
          "trailer",
          rig.trailerId,
          `${rigName(trailer, "Trailer")} needs a "${trailer?.hitchType?.trim()}" hitch; ${truckName} has "${vehicle.hitchType?.trim()}".`,
          "Attach it to a truck with the same hitch.",
        );
    }

    if (!rig.driverId)
      add(
        "driver",
        "truck",
        rig.vehicleId,
        `${truckName} has no driver.`,
        "Pick a driver for the truck on the event tracker.",
      );
    else {
      const certificate = vehicle.driverQualificationName?.trim();
      if (certificate && !holds(rig.driverId, certificate, until)) {
        const driver = snap.people.find((row) => row._id === rig.driverId);
        add(
          "certificate",
          "person",
          rig.driverId,
          `${personName(driver)} does not hold "${certificate}" to drive ${truckName}.`,
          "Pick a driver who holds it, or record their certificate.",
        );
      }
    }

    const riders = new Set(
      crew
        .filter((row) => row.rideVehicleAssignmentId === rig._id)
        .map((row) => row.personId),
    );
    if (rig.driverId) riders.add(rig.driverId);
    if (vehicle.seatCount == null) {
      if (riders.size > 1)
        add(
          "unplanned",
          "truck",
          rig.vehicleId,
          `${riders.size} people ride in ${truckName}, and its seats are not recorded.`,
          "Record how many seats it has.",
        );
    } else if (riders.size > vehicle.seatCount)
      add(
        "seats",
        "truck",
        rig.vehicleId,
        `${riders.size} people ride in ${truckName}; it has ${vehicle.seatCount} ${vehicle.seatCount === 1 ? "seat" : "seats"}.`,
        "Move someone to another truck, or have them meet at the venue.",
      );

    const carried = lines.filter(
      (row) =>
        row.loadAssignmentId === rig._id ||
        (row.loadAssignmentId == null && rigs.length === 1),
    );
    const weight = carried.reduce(
      (sum, row) =>
        sum + (Number(row.unitWeightKg) || 0) * Number(row.requiredQuantity),
      0,
    );
    const capacity =
      vehicle.payloadCapacityKg + (trailer?.payloadCapacityKg ?? 0);
    if (weight > capacity)
      add(
        "load",
        "truck",
        rig.vehicleId,
        `${truckName} carries ${shown(weight)} kg; it can carry ${shown(capacity)} kg.`,
        "Move pack lines to another truck, or use a bigger one.",
      );

    // What the trailer weighs on the hitch: its own weight plus the load the
    // truck itself can't take. Checked only when both weights are recorded.
    if (
      trailer &&
      trailer.emptyWeightKg != null &&
      vehicle.towCapacityKg != null &&
      vehicle.towCapacityKg > 0
    ) {
      const pulled =
        trailer.emptyWeightKg + Math.max(0, weight - vehicle.payloadCapacityKg);
      if (pulled > vehicle.towCapacityKg)
        add(
          "towing",
          "truck",
          rig.vehicleId,
          `${truckName} would pull ${shown(pulled)} kg; its towing limit is ${shown(vehicle.towCapacityKg)} kg.`,
          "Move pack lines into the truck or another truck, or use a truck that tows more.",
        );
    }

    // Cargo space, when the truck's (and trailer's) space is recorded.
    const space =
      vehicle.cargoVolumeM3 == null
        ? null
        : vehicle.cargoVolumeM3 +
          (rig.trailerId ? (trailer?.cargoVolumeM3 ?? 0) : 0);
    if (space != null) {
      const sized = carried.filter((row) => row.unitVolumeM3 != null);
      const volume = sized.reduce(
        (sum, row) =>
          sum + Number(row.unitVolumeM3) * Number(row.requiredQuantity),
        0,
      );
      if (volume > space)
        add(
          "load",
          "truck",
          rig.vehicleId,
          `${truckName} carries ${shown(volume)} m³; it has ${shown(space)} m³ of space.`,
          "Move pack lines to another truck, or use a bigger one.",
        );
      else if (sized.length < carried.length)
        add(
          "unplanned",
          "truck",
          rig.vehicleId,
          `${carried.length - sized.length} pack ${carried.length - sized.length === 1 ? "line on" : "lines on"} ${truckName} ${carried.length - sized.length === 1 ? "has" : "have"} no size, so the space check is not complete.`,
          "Record the size on the load sheet (Truck load view).",
        );
    }
  }

  // --- Equipment ----------------------------------------------------------------
  const held = snap.reservations.filter(
    (row) =>
      row.deletedAt == null &&
      row.eventId === eventId &&
      LIVE_HOLDS.has(row.status),
  );
  const heldOf = (equipmentId: string) =>
    held
      .filter((row) => row.equipmentId === equipmentId)
      .reduce((sum, row) => sum + row.quantity, 0);
  const pieces: PlannedPiece[] = [];
  const seen = new Set<string>();

  for (const hold of held) {
    const item = snap.equipment.find((row) => row._id === hold.equipmentId);
    if (!item) continue;
    pieces.push({
      id: hold._id,
      name: item.name,
      quantity: hold.quantity,
      provides: parseSupplies(item.providesJson),
      needs: parseNeeds(item.needsJson),
    });
    if (seen.has(item._id)) continue;
    seen.add(item._id);

    if (
      item.deletedAt != null ||
      item.status === "retired" ||
      item.condition === "out_of_service"
    )
      add(
        "not_available",
        "equipment",
        item._id,
        `${item.name} is ${item.condition === "out_of_service" ? "out of service" : "retired"}.`,
        "Hold another item, or fix its status on the Equipment page.",
      );

    const outOfUse = snap.equipmentIssues
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.equipmentId === item._id &&
          row.status === "open" &&
          row.holdsUnits,
      )
      .reduce((sum, row) => sum + row.quantity, 0);
    const usable = Math.max(0, item.quantity - outOfUse);
    const here = heldOf(item._id);
    if (here > item.quantity)
      add(
        "amount",
        "equipment",
        item._id,
        `${here} ${item.name} held; the company has ${item.quantity}.`,
        "Hold fewer, or rent the rest.",
      );

    // Busiest moment across every event that holds this item.
    const span =
      hold.startsAt != null && hold.endsAt != null
        ? { start: hold.startsAt, end: hold.endsAt }
        : window;
    if (!span) continue;
    const points: Array<[number, number]> = [
      [span.start, here],
      [span.end, -here],
    ];
    const clashes = new Set<string>();
    for (const other of snap.reservations) {
      if (
        other.deletedAt != null ||
        other.equipmentId !== item._id ||
        !LIVE_HOLDS.has(other.status) ||
        other.startsAt == null ||
        other.endsAt == null
      )
        continue;
      const otherOf = otherEvent(other.eventId);
      if (!otherOf) continue;
      const theirs = { start: other.startsAt, end: other.endsAt };
      if (!overlaps(span, theirs)) continue;
      clashes.add(conflictName(otherOf));
      points.push(
        [Math.max(span.start, theirs.start), other.quantity],
        [Math.min(span.end, theirs.end), -other.quantity],
      );
    }
    let now = 0;
    let peak = 0;
    for (const [, change] of points.sort(
      (a, b) => a[0] - b[0] || a[1] - b[1],
    )) {
      now += change;
      peak = Math.max(peak, now);
    }
    if (clashes.size > 0 && peak > usable)
      add(
        "double_booked",
        "equipment",
        item._id,
        `${peak} ${item.name} are needed at once; ${usable} ${usable === 1 ? "is" : "are"} free. Also held for ${[...clashes].join(", ")}.`,
        "Hold fewer on one of the events, or rent the rest.",
      );

    // The parts that always go with it, across every hold on this event.
    for (const part of snap.parts) {
      if (
        part.deletedAt != null ||
        part.removedAt != null ||
        part.role !== "part" ||
        part.equipmentId !== item._id
      )
        continue;
      const needed = part.quantity * here;
      const have = heldOf(part.partEquipmentId);
      if (have >= needed) continue;
      const partItem = snap.equipment.find(
        (row) => row._id === part.partEquipmentId,
      );
      add(
        "goes_with",
        "equipment",
        item._id,
        `${item.name} goes with ${needed} ${partItem?.name ?? "of a part"}; ${have} held.`,
        "Hold the missing parts for the event.",
      );
    }
  }

  for (const gap of unmetNeeds(
    pieces,
    parseSupplies(wanted?.siteProvidesJson),
  )) {
    const hold = held.find((row) => row._id === gap.pieceId);
    add(
      "supply",
      "equipment",
      hold?.equipmentId ?? gap.pieceId,
      `${gap.name} needs ${shown(gap.needed)} ${gap.anyOf.join(" or ")}, and nothing on the event supplies it.`,
      "Hold something that supplies it, or record that the site has it.",
    );
  }

  const rank = { fix: 0, look: 1 } as const;
  return issues.sort((a, b) => rank[a.level] - rank[b.level]);
}

export function planStatus(issues: readonly PlanIssue[]): PlanStatus {
  if (issues.some((row) => row.level === "fix")) return "fix";
  return issues.length > 0 ? "look" : "ready";
}

export type PlanCandidate =
  | { kind: "person"; personId: string }
  | { kind: "truck"; vehicleId: string }
  | { kind: "trailer"; trailerId: string }
  | { kind: "equipment"; equipmentId: string; quantity: number };

const PREVIEW_ID = "__preview__";

/** The snapshot as it would be with one more thing on the event. */
export function withCandidate(
  snap: PlanSnapshot,
  eventId: string,
  candidate: PlanCandidate,
): PlanSnapshot {
  const event = snap.events.find((row) => row._id === eventId);
  const span = event ? eventWindow(event) : null;
  switch (candidate.kind) {
    case "person":
      return {
        ...snap,
        assignments: [
          ...snap.assignments,
          {
            _id: PREVIEW_ID,
            eventId,
            personId: candidate.personId,
            role: "",
            status: "assigned",
          },
        ],
      };
    case "truck":
      return {
        ...snap,
        rigs: [
          ...snap.rigs,
          {
            _id: PREVIEW_ID,
            eventId,
            activeEventId: eventId,
            vehicleId: candidate.vehicleId,
          },
        ],
      };
    case "trailer":
      return {
        ...snap,
        rigs: [
          ...snap.rigs,
          {
            _id: PREVIEW_ID,
            eventId,
            activeEventId: eventId,
            trailerId: candidate.trailerId,
            // A lone trailer is its own finding; preview it as hitched.
            vendorName: "preview",
          },
        ],
      };
    case "equipment":
      return {
        ...snap,
        reservations: [
          ...snap.reservations,
          {
            _id: PREVIEW_ID,
            equipmentId: candidate.equipmentId,
            eventId,
            quantity: candidate.quantity,
            status: "reserved",
            startsAt: span?.start ?? null,
            endsAt: span?.end ?? null,
          },
        ],
      };
  }
}

const candidateId = (candidate: PlanCandidate) =>
  candidate.kind === "person"
    ? candidate.personId
    : candidate.kind === "truck"
      ? candidate.vehicleId
      : candidate.kind === "trailer"
        ? candidate.trailerId
        : candidate.equipmentId;

/**
 * What would be wrong with this person, truck, trailer or item if it went on
 * the event: only its own double booking, availability and amount. A truck
 * with no driver yet is not a reason to keep it off the event.
 */
export function candidateIssues(
  snap: PlanSnapshot,
  eventId: string,
  candidate: PlanCandidate,
  levels: PlanLevels,
): PlanIssue[] {
  const id = candidateId(candidate);
  return checkEventPlan(
    withCandidate(snap, eventId, candidate),
    eventId,
    levels,
  ).filter(
    (issue) =>
      issue.subjectId === id &&
      ["double_booked", "not_available", "amount", "supply"].includes(
        issue.check,
      ),
  );
}
