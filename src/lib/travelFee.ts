/**
 * Travel & delivery fee: the company rule (Organization.travelFee*) applied to
 * the distance from the kitchen to the venue. One calculation for the event
 * panel, the proposal travel line and the invoice travel line.
 */

export type TravelFeeMode = "off" | "per_mile" | "zone";

export type TravelFeeZone = { upToMiles: number; fee: number };

export type TravelFeeRule = {
  mode: TravelFeeMode;
  ratePerMile: number;
  freeMiles: number;
  minimumFee: number;
  roundTrip: boolean;
  zones: TravelFeeZone[];
};

export const TRAVEL_FEE_LINE_DESCRIPTION = "Travel & delivery fee";

const METERS_PER_MILE = 1609.344;

export const metersToMiles = (meters: number) => meters / METERS_PER_MILE;

const nonNegative = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const roundCents = (value: number) => Math.round(value * 100) / 100;

/** Distance bands from the stored JSON list; bad rows are dropped. */
export function parseTravelFeeZones(
  json: string | null | undefined,
): TravelFeeZone[] {
  if (!json) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      upToMiles: Number((row as { upToMiles?: unknown })?.upToMiles),
      fee: Number((row as { fee?: unknown })?.fee),
    }))
    .filter(
      (zone) =>
        Number.isFinite(zone.upToMiles) &&
        zone.upToMiles > 0 &&
        Number.isFinite(zone.fee) &&
        zone.fee >= 0,
    )
    .sort((a, b) => a.upToMiles - b.upToMiles);
}

export function readTravelFeeRule(
  organization: {
    travelFeeMode?: string | null;
    travelFeeRatePerMile?: number | null;
    travelFeeFreeMiles?: number | null;
    travelFeeMinimum?: number | null;
    travelFeeRoundTrip?: boolean | null;
    travelFeeZonesJson?: string | null;
  } | null,
): TravelFeeRule {
  const mode = organization?.travelFeeMode;
  return {
    mode: mode === "per_mile" || mode === "zone" ? mode : "off",
    ratePerMile: nonNegative(organization?.travelFeeRatePerMile),
    freeMiles: nonNegative(organization?.travelFeeFreeMiles),
    minimumFee: nonNegative(organization?.travelFeeMinimum),
    roundTrip: organization?.travelFeeRoundTrip === true,
    zones: parseTravelFeeZones(organization?.travelFeeZonesJson),
  };
}

/**
 * The fee for a one-way distance in miles. Per mile: the charged miles past
 * the free miles times the rate. Zone: the first band the distance fits in;
 * past the last band, that band's fee plus the rate for each mile past it.
 * A fee above zero is never below the minimum. Off or no distance: zero.
 */
export function computeTravelFee(
  rule: TravelFeeRule,
  oneWayMiles: number | null,
): number {
  if (rule.mode === "off" || oneWayMiles == null || !(oneWayMiles >= 0))
    return 0;
  const miles = rule.roundTrip ? oneWayMiles * 2 : oneWayMiles;
  let fee = 0;
  if (rule.mode === "per_mile") {
    fee = Math.max(0, miles - rule.freeMiles) * rule.ratePerMile;
  } else {
    if (miles <= rule.freeMiles) return 0;
    const zone = rule.zones.find((row) => miles <= row.upToMiles);
    const last = rule.zones[rule.zones.length - 1];
    if (zone) fee = zone.fee;
    else if (last) fee = last.fee + (miles - last.upToMiles) * rule.ratePerMile;
    else fee = Math.max(0, miles - rule.freeMiles) * rule.ratePerMile;
  }
  if (fee > 0) fee = Math.max(fee, rule.minimumFee);
  return roundCents(fee);
}

export type EventTravelFee = {
  rule: TravelFeeRule;
  /** One-way miles used, or null when no distance is known. */
  distanceMiles: number | null;
  distanceSource: "typed" | "route" | null;
  computedFee: number;
  overrideFee: number | null;
  overrideReason: string | null;
  /** What the proposal and invoice charge. */
  fee: number;
};

/** A typed distance wins over the route distance; an override wins over the rule. */
export function resolveEventTravelFee(input: {
  rule: TravelFeeRule;
  typedMiles: number | null | undefined;
  routeMeters: number | null | undefined;
  overrideFee: number | null | undefined;
  overrideReason: string | null | undefined;
}): EventTravelFee {
  const typed =
    input.typedMiles != null && input.typedMiles >= 0 ? input.typedMiles : null;
  const route =
    input.routeMeters != null && input.routeMeters >= 0
      ? Math.round(metersToMiles(input.routeMeters) * 10) / 10
      : null;
  const distanceMiles = typed ?? route;
  const computedFee = computeTravelFee(input.rule, distanceMiles);
  const overrideFee =
    input.overrideFee != null && input.overrideFee >= 0
      ? roundCents(input.overrideFee)
      : null;
  return {
    rule: input.rule,
    distanceMiles,
    distanceSource: typed != null ? "typed" : route != null ? "route" : null,
    computedFee,
    overrideFee,
    overrideReason: input.overrideReason?.trim() || null,
    fee: overrideFee ?? computedFee,
  };
}

/** Short line note, e.g. "24.3 mi each way" or "Set by hand". */
export function travelFeeNote(fee: EventTravelFee): string | undefined {
  if (fee.overrideFee != null)
    return fee.overrideReason ?? "Set for this event";
  if (fee.distanceMiles == null) return undefined;
  return `${fee.distanceMiles} mi each way${fee.rule.roundTrip ? ", charged there and back" : ""}`;
}
