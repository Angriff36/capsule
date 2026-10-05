/**
 * Truck loads, stops and the transport facts of pack lines (PL-DELIVERY,
 * spec §13.3, AC-535 and AC-550). Pure: no Convex.
 *
 * A rig is one truck, one trailer, or a truck pulling a trailer. What it can
 * carry is the truck's payload plus the trailer's payload, and a trailer never
 * carries more than the truck can pull. Lines without a weight are not counted
 * and are named, so a person can see the check is partial.
 */

import { legBusyWindow, type RouteLeg } from "./eventRouteLegs";

export type RigUnit = {
  label: string;
  payloadCapacityKg: number;
  /** Trucks only. null = not recorded; 0 = cannot pull a trailer. */
  towCapacityKg?: number | null;
};

export type LoadLine = {
  description: string;
  unitWeightKg?: number | null;
  requiredQuantity: number;
  packedQuantity: number;
  excluded?: boolean;
  retired?: boolean;
};

export type RigCapacity = {
  capacityKg: number;
  /** Set when the trailer's payload is cut down to what the truck can pull. */
  towLimited: boolean;
};

const finite = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A trailer on a truck that cannot pull one; null when the pair is fine. */
export function rigCompatibilityProblem(
  vehicle: RigUnit | null,
  trailer: RigUnit | null,
): string | null {
  if (!vehicle || !trailer) return null;
  const tow = finite(vehicle.towCapacityKg);
  if (tow === 0) {
    return `${vehicle.label} cannot pull a trailer. Pick a truck with a hitch for ${trailer.label}, or book the trailer on its own.`;
  }
  return null;
}

export function rigCapacity(
  vehicle: RigUnit | null,
  trailer: RigUnit | null,
): RigCapacity {
  const truck = vehicle ? Math.max(0, vehicle.payloadCapacityKg) : 0;
  if (!trailer) return { capacityKg: truck, towLimited: false };
  const tow = vehicle ? finite(vehicle.towCapacityKg) : null;
  const trailerPayload = Math.max(0, trailer.payloadCapacityKg);
  const pulled = tow == null ? trailerPayload : Math.min(trailerPayload, tow);
  return { capacityKg: truck + pulled, towLimited: pulled < trailerPayload };
}

/** Weight of one line: the larger of what is needed and what was packed. */
export function lineWeightKg(line: LoadLine): number | null {
  if (line.excluded || line.retired) return 0;
  const unit = finite(line.unitWeightKg);
  if (unit == null) return null;
  return unit * Math.max(line.requiredQuantity, line.packedQuantity, 0);
}

export type RigLoad = {
  loadKg: number;
  capacityKg: number;
  overKg: number;
  towLimited: boolean;
  /** Lines on this rig with no weight yet. */
  unweighed: string[];
};

export function rigLoad(
  vehicle: RigUnit | null,
  trailer: RigUnit | null,
  lines: readonly LoadLine[],
): RigLoad {
  const { capacityKg, towLimited } = rigCapacity(vehicle, trailer);
  let loadKg = 0;
  const unweighed: string[] = [];
  for (const line of lines) {
    const weight = lineWeightKg(line);
    if (weight == null) unweighed.push(line.description);
    else loadKg += weight;
  }
  loadKg = Math.round(loadKg * 10) / 10;
  return {
    loadKg,
    capacityKg,
    overKg: Math.max(0, Math.round((loadKg - capacityKg) * 10) / 10),
    towLimited,
    unweighed,
  };
}

/** Plain refusal for a load past what the rig can carry; null when it fits. */
export function rigOverloadMessage(
  label: string,
  load: RigLoad,
): string | null {
  if (load.overKg <= 0) return null;
  return `${label} can carry ${load.capacityKg} kg${load.towLimited ? " (the trailer is held to what the truck can pull)" : ""}; this load is ${load.loadKg} kg, ${load.overKg} kg too much. Put some lines on another truck or add a truck.`;
}

export type StopKind = "load" | "drop" | "pickup" | "unload";

export type RouteStop = {
  legId: string;
  kind: StopKind;
  /** Plain words: "Load at the kitchen", "Drop at the venue". */
  label: string;
  startsAt: number | null;
  endsAt: number | null;
  crew: string[];
  /** Plain words when no one is named for this stop. */
  crewMissing: string | null;
};

const STOP_LABEL: Record<StopKind, string> = {
  load: "Load at the kitchen",
  drop: "Drop at the venue",
  pickup: "Pick up at the venue",
  unload: "Unload at the kitchen",
};

/**
 * Stops of each truck and vendor run with their windows and who is
 * responsible. `crewByLeg` holds driver and riders of each rig; a vendor run
 * is the vendor's own responsibility.
 */
export function routeStops(
  legs: readonly RouteLeg[],
  crewByLeg: Readonly<Record<string, readonly string[]>>,
  vendorByLeg: Readonly<Record<string, string>> = {},
): RouteStop[] {
  const stops: RouteStop[] = [];
  for (const leg of legs) {
    if (leg.kind === "main") continue;
    const vendor = vendorByLeg[leg.id];
    const crew =
      leg.kind === "vendor" && vendor
        ? [vendor]
        : [...(crewByLeg[leg.id] ?? [])];
    const stop = (
      kind: StopKind,
      startsAt: number | null,
      endsAt: number | null,
    ): RouteStop => ({
      legId: leg.id,
      kind,
      label: STOP_LABEL[kind],
      startsAt,
      endsAt,
      crew,
      crewMissing: crew.length
        ? null
        : `No one is named for ${leg.label}. Pick a driver or put crew on this truck.`,
    });
    if (leg.kind === "vendor") {
      stops.push(stop("drop", leg.arriveAt, leg.departVenueAt));
      continue;
    }
    stops.push(stop("load", leg.loadStartAt, leg.departShopAt));
    stops.push(stop("drop", leg.arriveAt, null));
    // A drop run leaves early; a crew run picks up after the event ends.
    stops.push(stop("pickup", null, leg.departVenueAt));
    stops.push(stop("unload", leg.returnShopAt, leg.staffOffAt));
  }
  return stops;
}

export type TransportLine = {
  id: string;
  loadAssignmentId?: string | null;
  category?: string | null;
  /** Food lines get a hold window (dish or container lines). */
  isFood: boolean;
};

export type LineTransport = {
  lineId: string;
  legId: string | null;
  rigLabel: string | null;
  trip: number | null;
  loadingZone: string | null;
  loadStartAt: number | null;
  departAt: number | null;
  arriveAt: number | null;
  /** Food out of the kitchen: from leaving until serve. */
  holdFrom: number | null;
  holdUntil: number | null;
  /** Plain words when the food is out of the kitchen more than four hours. */
  holdWarning: string | null;
  note: string | null;
};

const HOLD_LIMIT_MS = 4 * 60 * 60_000;

/**
 * Which truck, trip, loading zone and times each pack line goes with. A line
 * not placed rides on the only truck when the event has one; otherwise it is
 * named as not placed. Trips count the runs of one truck in leaving order.
 */
export function packLineTransport(
  lines: readonly TransportLine[],
  legs: readonly RouteLeg[],
  zones: Readonly<Record<string, string | null | undefined>>,
  serviceStartsAt: number | null,
): LineTransport[] {
  const rigs = legs.filter((leg) => leg.kind !== "main");
  const trucks = rigs.filter((leg) => leg.kind === "rig");
  const trip = new Map<string, number>();
  const byUnit = new Map<string, RouteLeg[]>();
  for (const leg of trucks) {
    const key = leg.vehicleId ?? leg.trailerId ?? leg.id;
    byUnit.set(key, [...(byUnit.get(key) ?? []), leg]);
  }
  for (const runs of byUnit.values()) {
    const ordered = [...runs].sort(
      (a, b) =>
        (legBusyWindow(a)?.startsAt ?? Number.MAX_SAFE_INTEGER) -
        (legBusyWindow(b)?.startsAt ?? Number.MAX_SAFE_INTEGER),
    );
    ordered.forEach((leg, index) => trip.set(leg.id, index + 1));
  }
  return lines.map((line) => {
    const leg =
      rigs.find((candidate) => candidate.id === line.loadAssignmentId) ??
      (line.loadAssignmentId == null && trucks.length === 1 ? trucks[0] : null);
    if (!leg) {
      return {
        lineId: line.id,
        legId: null,
        rigLabel: null,
        trip: null,
        loadingZone: null,
        loadStartAt: null,
        departAt: null,
        arriveAt: null,
        holdFrom: null,
        holdUntil: null,
        holdWarning: null,
        note: rigs.length
          ? "Not on a truck yet."
          : "No truck on this event yet.",
      };
    }
    const holdFrom = line.isFood ? (leg.departShopAt ?? leg.arriveAt) : null;
    const holdUntil = line.isFood ? serviceStartsAt : null;
    const tooLong =
      holdFrom != null &&
      holdUntil != null &&
      holdUntil - holdFrom > HOLD_LIMIT_MS;
    return {
      lineId: line.id,
      legId: leg.id,
      rigLabel: leg.label,
      trip: trip.get(leg.id) ?? null,
      loadingZone: zones[leg.id]?.trim() || null,
      loadStartAt: leg.loadStartAt,
      departAt: leg.departShopAt,
      arriveAt: leg.arriveAt,
      holdFrom,
      holdUntil,
      holdWarning: tooLong
        ? "Food is out of the kitchen more than 4 hours before serve. Send it on a later run or keep it hot or cold on the truck."
        : null,
      note: null,
    };
  });
}
