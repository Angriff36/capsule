/**
 * Separate truck, crew and vendor windows for one event (spec §8.4, PL-ROUTE-LEGS).
 * Pure: no Convex.
 *
 * Every leg is worked out from the same event facts (serve time, end time,
 * setup, drive both ways, safety time, load, briefing, cleanup, unload), so a
 * change to the event moves every leg together. A truck may arrive earlier or
 * later than the main crew, load for a different time, or drop and come back
 * (a second trip); an outside vendor only has an arrival; a person who meets
 * the crew at the venue works on-site times only.
 */

export type LegEventFacts = {
  serviceStartsAt?: number | null;
  endsAt?: number | null;
  timingSetupMinutes?: number | null;
  timingLoadMinutes?: number | null;
  timingOutboundTravelMinutes?: number | null;
  timingReturnTravelMinutes?: number | null;
  timingSafetyBufferMinutes?: number | null;
  timingBriefingMinutes?: number | null;
  timingCleanupMinutes?: number | null;
  timingUnloadMinutes?: number | null;
};

export type RigLegInput = {
  id: string;
  label: string;
  vehicleId?: string | null;
  trailerId?: string | null;
  vendorName?: string | null;
  /** On site this long before serve; unset = with the main crew. */
  arriveBeforeServeMinutes?: number | null;
  /** Load time for this truck; unset = the event's load time. */
  loadMinutes?: number | null;
  /** Leaves the venue this long after arriving (a drop run); unset = stays to the end. */
  leaveAfterMinutes?: number | null;
};

export type RouteLeg = {
  id: string;
  kind: "main" | "rig" | "vendor";
  label: string;
  vehicleId: string | null;
  trailerId: string | null;
  loadStartAt: number | null;
  departShopAt: number | null;
  arriveAt: number | null;
  departVenueAt: number | null;
  returnShopAt: number | null;
  staffOnAt: number | null;
  staffOffAt: number | null;
  /** Plain words: where each time comes from. */
  explanation: string[];
};

export type LegConflict = {
  legIds: string[];
  message: string;
};

export type CrewLegChoice = {
  meetsAtVenue?: boolean | null;
  rideVehicleAssignmentId?: string | null;
};

export const MAIN_LEG_ID = "main";

const MINUTE = 60_000;

const num = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const minus = (at: number | null, minutes: number | null) =>
  at != null && minutes != null ? at - minutes * MINUTE : null;

const plus = (at: number | null, minutes: number | null) =>
  at != null && minutes != null ? at + minutes * MINUTE : null;

function workLeg(
  facts: LegEventFacts,
  base: {
    id: string;
    kind: "main" | "rig";
    label: string;
    vehicleId: string | null;
    trailerId: string | null;
  },
  arriveBeforeServe: number | null,
  load: number | null,
  leaveAfter: number | null,
): RouteLeg {
  const setup = arriveBeforeServe ?? num(facts.timingSetupMinutes);
  const outbound = num(facts.timingOutboundTravelMinutes);
  const buffer = num(facts.timingSafetyBufferMinutes) ?? 0;
  const briefing = num(facts.timingBriefingMinutes) ?? 0;
  const cleanup = num(facts.timingCleanupMinutes);
  const back = num(facts.timingReturnTravelMinutes);
  const unload = num(facts.timingUnloadMinutes);
  const arriveAt = minus(num(facts.serviceStartsAt), setup);
  const departShopAt =
    outbound != null ? minus(arriveAt, outbound + buffer) : null;
  const loadStartAt = minus(departShopAt, load);
  const staffOnAt = minus(loadStartAt, briefing);
  const departVenueAt =
    leaveAfter != null
      ? plus(arriveAt, leaveAfter)
      : plus(num(facts.endsAt), cleanup);
  const returnShopAt = plus(departVenueAt, back);
  const staffOffAt = plus(returnShopAt, unload);
  const explanation = [
    setup == null
      ? "Setup time before serve is not set yet."
      : `On site ${setup} min before serve${arriveBeforeServe != null ? " (this truck's own time)" : ""}.`,
    outbound == null
      ? "Drive time from the kitchen is not known yet."
      : `Leaves the kitchen ${outbound} min drive${buffer ? ` + ${buffer} min safety time` : ""} before arriving.`,
    load == null
      ? "Load time is not set yet."
      : `Loading starts ${load} min before leaving.`,
    ...(briefing
      ? [`Crew on ${briefing} min before loading for the briefing.`]
      : []),
    leaveAfter != null
      ? `Drops and leaves the venue ${leaveAfter} min after arriving.`
      : `Leaves the venue after ${cleanup ?? "?"} min of cleanup and reload.`,
  ];
  return {
    ...base,
    loadStartAt,
    departShopAt,
    arriveAt,
    departVenueAt,
    returnShopAt,
    staffOnAt,
    staffOffAt,
    explanation,
  };
}

/** One leg for the main crew, one for each truck, trailer or vendor on the event. */
export function deriveRouteLegs(
  facts: LegEventFacts,
  rigs: readonly RigLegInput[],
): RouteLeg[] {
  const main = workLeg(
    facts,
    {
      id: MAIN_LEG_ID,
      kind: "main",
      label: "Main crew",
      vehicleId: null,
      trailerId: null,
    },
    null,
    num(facts.timingLoadMinutes),
    null,
  );
  const legs: RouteLeg[] = [main];
  for (const rig of rigs) {
    const vehicleId = rig.vehicleId ?? null;
    const trailerId = rig.trailerId ?? null;
    if (vehicleId == null && trailerId == null) {
      const before =
        num(rig.arriveBeforeServeMinutes) ?? num(facts.timingSetupMinutes);
      const arriveAt = minus(num(facts.serviceStartsAt), before);
      const leaveAfter = num(rig.leaveAfterMinutes);
      legs.push({
        id: rig.id,
        kind: "vendor",
        label: rig.label,
        vehicleId: null,
        trailerId: null,
        loadStartAt: null,
        departShopAt: null,
        arriveAt,
        departVenueAt: leaveAfter != null ? plus(arriveAt, leaveAfter) : null,
        returnShopAt: null,
        staffOnAt: null,
        staffOffAt: null,
        explanation: [
          before == null
            ? "Arrival before serve is not set yet."
            : `Outside vendor, on site ${before} min before serve.`,
          ...(leaveAfter != null
            ? [`Leaves ${leaveAfter} min after arriving.`]
            : []),
        ],
      });
      continue;
    }
    legs.push(
      workLeg(
        facts,
        { id: rig.id, kind: "rig", label: rig.label, vehicleId, trailerId },
        num(rig.arriveBeforeServeMinutes),
        num(rig.loadMinutes) ?? num(facts.timingLoadMinutes),
        num(rig.leaveAfterMinutes),
      ),
    );
  }
  return legs;
}

/** When the truck or trailer is out: from loading (or leaving) until it is back. */
export function legBusyWindow(
  leg: RouteLeg,
): { startsAt: number; endsAt: number } | null {
  const startsAt = leg.loadStartAt ?? leg.departShopAt ?? leg.arriveAt;
  const endsAt = leg.returnShopAt ?? leg.departVenueAt;
  return startsAt != null && endsAt != null && endsAt > startsAt
    ? { startsAt, endsAt }
    : null;
}

/**
 * The same truck or trailer cannot be on two runs at once. Half-open windows:
 * a truck back at 2:00 may load again at 2:00. `others` are legs of other
 * events that use the same trucks.
 */
export function legConflicts(
  legs: readonly RouteLeg[],
  others: readonly (RouteLeg & { eventLabel: string })[] = [],
): LegConflict[] {
  const conflicts: LegConflict[] = [];
  const rigs = legs.filter((leg) => leg.kind === "rig");
  const overlap = (a: RouteLeg, b: RouteLeg) => {
    const x = legBusyWindow(a);
    const y = legBusyWindow(b);
    return (
      x != null && y != null && x.startsAt < y.endsAt && y.startsAt < x.endsAt
    );
  };
  const shared = (a: RouteLeg, b: RouteLeg) =>
    (a.vehicleId != null && a.vehicleId === b.vehicleId) ||
    (a.trailerId != null && a.trailerId === b.trailerId);
  rigs.forEach((a, index) => {
    for (const b of rigs.slice(index + 1)) {
      if (shared(a, b) && overlap(a, b)) {
        conflicts.push({
          legIds: [a.id, b.id],
          message: `${a.label} and ${b.label} need the same truck or trailer at the same time. Give the second run a later time or another truck.`,
        });
      }
    }
    for (const b of others) {
      if (shared(a, b) && overlap(a, b)) {
        conflicts.push({
          legIds: [a.id],
          message: `${a.label} is also out for ${b.eventLabel} at that time.`,
        });
      }
    }
  });
  return conflicts;
}

/**
 * A person's working window. Riding a truck = that truck's crew times; meeting
 * at the venue = on-site times of the main crew; otherwise the main crew.
 */
export function crewWindowForLeg(
  legs: readonly RouteLeg[],
  choice: CrewLegChoice,
  mainWindow: { startsAt: number | null; endsAt: number | null },
): { startsAt: number | null; endsAt: number | null; legId: string } {
  const rig = choice.rideVehicleAssignmentId
    ? legs.find(
        (leg) =>
          leg.kind === "rig" && leg.id === choice.rideVehicleAssignmentId,
      )
    : undefined;
  if (rig)
    return { startsAt: rig.staffOnAt, endsAt: rig.staffOffAt, legId: rig.id };
  if (choice.meetsAtVenue === true) {
    const main = legs.find((leg) => leg.id === MAIN_LEG_ID);
    return {
      startsAt: main?.arriveAt ?? null,
      endsAt: main?.departVenueAt ?? null,
      legId: "venue",
    };
  }
  return { ...mainWindow, legId: MAIN_LEG_ID };
}
