/**
 * Rentals and equipment for a period (PL-REPORT-METRICS AC-552, spec BE-13):
 * what clients are charged for equipment, what vendors charge us, what was
 * lost or damaged, and how busy our own equipment was. Pure; the card passes
 * the live lists in. Unknown prices and costs stay unknown and are counted,
 * never read as zero.
 *
 * - equipment charged: for an event whose accepted proposal names rental
 *   items, what the client agreed to pay for those lines (soldEvents counts
 *   them); for any other event, each live hold, quantity x the item's client
 *   price; holds whose item has no client price are counted in unpricedHolds;
 * - vendor cost: rental lines from vendors for those events, cancelled out;
 * - loss and damage: missing / damaged problems raised in the period, units,
 *   known cost (unknown counted), and what the client or vendor will pay;
 * - use: for each owned item, unit-hours held on events in the period over
 *   unit-hours it could have been out.
 */

type Live = { readonly deletedAt?: number | null };

export type RentalEvent = Live & {
  readonly _id: string;
  readonly stage: string;
  readonly startsAt?: number | null;
};
export type RentalEquipment = Live & {
  readonly _id: string;
  readonly name: string;
  readonly ownership: string;
  readonly quantity: number;
  readonly status: string;
  readonly customerPrice?: number | null;
};
export type RentalHold = Live & {
  readonly equipmentId: string;
  readonly eventId: string;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly quantity: number;
  readonly status: string;
};
export type RentalLine = Live & {
  readonly eventId: string;
  readonly vendorCost: number;
  readonly status: string;
};
/** What the client agreed to pay for rental items on one event. */
export type RentalSale = {
  readonly eventId: string;
  readonly amount: number;
};
export type RentalIssue = Live & {
  readonly kind: string;
  readonly quantity: number;
  readonly raisedAt?: number | null;
  readonly cost?: number | null;
  readonly payer: string;
  readonly chargeAmount?: number | null;
};

export type ItemUse = {
  readonly equipmentId: string;
  readonly name: string;
  /** 0..1 share of the period's unit-hours the item was held on events. */
  readonly share: number;
};

export type RentalReport = {
  readonly equipmentCharged: number;
  readonly soldEvents: number;
  readonly unpricedHolds: number;
  readonly vendorCost: number;
  readonly vendorLines: number;
  readonly lostOrDamagedUnits: number;
  readonly lossCost: number;
  readonly lossCostUnknown: number;
  readonly recovered: number;
  readonly averageUse: number | null;
  readonly busiest: readonly ItemUse[];
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const HOUR = 3_600_000;

export function rentalReport(
  input: {
    readonly events: readonly RentalEvent[];
    readonly equipment: readonly RentalEquipment[];
    readonly holds: readonly RentalHold[];
    readonly lines: readonly RentalLine[];
    readonly issues: readonly RentalIssue[];
    readonly sales?: readonly RentalSale[];
  },
  periodStart: number,
  periodEnd: number,
): RentalReport {
  const inPeriod = new Set(
    input.events
      .filter(
        (event) =>
          event.deletedAt == null &&
          event.stage !== "cancelled" &&
          event.startsAt != null &&
          event.startsAt >= periodStart &&
          event.startsAt < periodEnd,
      )
      .map((event) => event._id),
  );
  const items = new Map(
    input.equipment
      .filter((item) => item.deletedAt == null)
      .map((item) => [item._id, item]),
  );
  // A hold left on a cancelled or removed event does not count anywhere.
  const liveEvents = new Set(
    input.events
      .filter((event) => event.deletedAt == null && event.stage !== "cancelled")
      .map((event) => event._id),
  );
  const liveHolds = input.holds.filter(
    (hold) =>
      hold.deletedAt == null &&
      hold.status !== "cancelled" &&
      liveEvents.has(hold.eventId),
  );

  let equipmentCharged = 0;
  const sold = new Set<string>();
  for (const sale of input.sales ?? []) {
    if (!inPeriod.has(sale.eventId)) continue;
    sold.add(sale.eventId);
    equipmentCharged += Number(sale.amount);
  }
  let unpricedHolds = 0;
  for (const hold of liveHolds) {
    if (!inPeriod.has(hold.eventId) || sold.has(hold.eventId)) continue;
    const price = items.get(hold.equipmentId)?.customerPrice;
    if (price == null) unpricedHolds += 1;
    else equipmentCharged += Number(price) * hold.quantity;
  }

  const vendorLines = input.lines.filter(
    (line) =>
      line.deletedAt == null &&
      line.status !== "cancelled" &&
      inPeriod.has(line.eventId),
  );
  const vendorCost = vendorLines.reduce(
    (sum, line) => sum + Number(line.vendorCost),
    0,
  );

  let lostOrDamagedUnits = 0;
  let lossCost = 0;
  let lossCostUnknown = 0;
  let recovered = 0;
  for (const issue of input.issues) {
    if (issue.deletedAt != null) continue;
    if (issue.kind !== "missing" && issue.kind !== "damaged") continue;
    if (
      issue.raisedAt == null ||
      issue.raisedAt < periodStart ||
      issue.raisedAt >= periodEnd
    )
      continue;
    lostOrDamagedUnits += issue.quantity;
    if (issue.cost == null) lossCostUnknown += 1;
    else lossCost += Number(issue.cost);
    if (
      (issue.payer === "client" || issue.payer === "vendor") &&
      issue.chargeAmount != null
    )
      recovered += Number(issue.chargeAmount);
  }

  const periodHours = Math.max(0, (periodEnd - periodStart) / HOUR);
  const use: ItemUse[] = [];
  for (const item of items.values()) {
    if (
      item.ownership !== "owned" ||
      item.status !== "active" ||
      item.quantity <= 0
    )
      continue;
    let heldHours = 0;
    for (const hold of liveHolds) {
      if (
        hold.equipmentId !== item._id ||
        hold.startsAt == null ||
        hold.endsAt == null
      )
        continue;
      const from = Math.max(hold.startsAt, periodStart);
      const to = Math.min(hold.endsAt, periodEnd);
      if (to > from) heldHours += ((to - from) / HOUR) * hold.quantity;
    }
    const capacity = periodHours * item.quantity;
    use.push({
      equipmentId: item._id,
      name: item.name,
      share: capacity > 0 ? Math.min(1, heldHours / capacity) : 0,
    });
  }
  use.sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));

  return {
    equipmentCharged: round2(equipmentCharged),
    soldEvents: sold.size,
    unpricedHolds,
    vendorCost: round2(vendorCost),
    vendorLines: vendorLines.length,
    lostOrDamagedUnits,
    lossCost: round2(lossCost),
    lossCostUnknown,
    recovered: round2(recovered),
    averageUse:
      use.length === 0
        ? null
        : use.reduce((sum, row) => sum + row.share, 0) / use.length,
    busiest: use.slice(0, 5),
  };
}
