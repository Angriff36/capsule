type MaybeNumber = number | string | null | undefined;

type SoftDelete = {
  deletedAt?: unknown;
};

export type ProfitabilityInvoice = SoftDelete & {
  eventId?: unknown;
  issuedAt?: unknown;
  status?: unknown;
  total?: MaybeNumber;
};

export type ProfitabilityIngredientDemand = SoftDelete & {
  _id: unknown;
  eventId?: unknown;
  status?: unknown;
};

export type ProfitabilityVendorOrder = SoftDelete & {
  _id: unknown;
  status?: unknown;
};

export type ProfitabilityVendorOrderLine = SoftDelete & {
  _id: unknown;
  vendorOrderId?: unknown;
  ingredientDemandId?: unknown;
  orderedQuantity?: MaybeNumber;
  unitCost?: MaybeNumber;
  status?: unknown;
};

export type ProfitabilityVendorOrderLineDemand = SoftDelete & {
  vendorOrderLineId?: unknown;
  ingredientDemandId?: unknown;
  vendorOrderId?: unknown;
  contributionQuantity?: MaybeNumber;
  linkedAt?: unknown;
  removedAt?: unknown;
};

export type ProfitabilityPayrollInput = SoftDelete & {
  eventId?: unknown;
  status?: unknown;
  regularMinutes?: MaybeNumber;
  overtimeMinutes?: MaybeNumber;
  totalMinutes?: MaybeNumber;
  hourlyRate?: MaybeNumber;
  overtimeRate?: MaybeNumber;
  grossAmount?: MaybeNumber;
};

export type ProfitabilityEquipment = SoftDelete & {
  _id: unknown;
  ownership?: unknown;
  purchaseValue?: MaybeNumber;
};

export type ProfitabilityEquipmentReservation = SoftDelete & {
  eventId?: unknown;
  equipmentId?: unknown;
  quantity?: MaybeNumber;
  status?: unknown;
};

export type LiveEventProfitability = {
  confirmedRevenue: number;
  ingredientCost: number;
  laborCost: number;
  equipmentCost: number;
  totalCommittedCost: number;
  margin: number;
  marginPercent: number | null;
  invoiceCount: number;
  ingredientOrderCount: number;
  ingredientLineCount: number;
  payrollInputCount: number;
  laborHours: number;
  unpricedLaborHours: number;
  equipmentReservationCount: number;
  rentalReservationCount: number;
  unpricedRentalReservationCount: number;
  hasIncompletePricing: boolean;
};

const COMMITTED_ORDER_STATUSES = new Set([
  "submitted",
  "confirmed",
  "partially_received",
  "received",
]);
const COMMITTED_LINE_STATUSES = new Set(["added", "receiving", "complete"]);
const VALUED_DEMAND_STATUSES = new Set(["confirmed", "fulfilled"]);
const REVIEWED_PAYROLL_STATUSES = new Set(["prepared", "finalized"]);
const ACTIVE_RESERVATION_STATUSES = new Set([
  "reserved",
  "checked_out",
  "returned",
]);
const EXCLUDED_INVOICE_STATUSES = new Set(["voided", "written_off"]);

const key = (value: unknown) => String(value ?? "");

const numberOrNull = (value: MaybeNumber) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const amount = (value: MaybeNumber) => numberOrNull(value) ?? 0;

const isActive = (row: SoftDelete) => row.deletedAt == null;

function calculateIngredientCost({
  eventId,
  demands,
  orders,
  lines,
  lineDemands,
}: {
  eventId: string;
  demands: readonly ProfitabilityIngredientDemand[];
  orders: readonly ProfitabilityVendorOrder[];
  lines: readonly ProfitabilityVendorOrderLine[];
  lineDemands: readonly ProfitabilityVendorOrderLineDemand[];
}) {
  const demandIds = new Set(
    demands
      .filter(
        (demand) =>
          isActive(demand) &&
          key(demand.eventId) === eventId &&
          VALUED_DEMAND_STATUSES.has(key(demand.status)),
      )
      .map((demand) => key(demand._id)),
  );
  const committedOrderIds = new Set(
    orders
      .filter(
        (order) =>
          isActive(order) && COMMITTED_ORDER_STATUSES.has(key(order.status)),
      )
      .map((order) => key(order._id)),
  );
  const lineById = new Map(
    lines
      .filter(
        (line) =>
          isActive(line) && COMMITTED_LINE_STATUSES.has(key(line.status)),
      )
      .map((line) => [key(line._id), line]),
  );
  const linkedDemandLines = new Set<string>();
  const countedOrders = new Set<string>();
  const countedLines = new Set<string>();
  let cost = 0;

  for (const link of lineDemands) {
    const demandId = key(link.ingredientDemandId);
    const lineId = key(link.vendorOrderLineId);
    const line = lineById.get(lineId);
    const orderId = key(link.vendorOrderId || line?.vendorOrderId);
    if (
      !isActive(link) ||
      link.linkedAt == null ||
      link.removedAt != null ||
      !demandIds.has(demandId) ||
      !line ||
      !committedOrderIds.has(orderId)
    ) {
      continue;
    }
    linkedDemandLines.add(`${demandId}:${lineId}`);
    countedOrders.add(orderId);
    countedLines.add(lineId);
    cost += amount(link.contributionQuantity) * amount(line.unitCost);
  }

  for (const line of lineById.values()) {
    const demandId = key(line.ingredientDemandId);
    const lineId = key(line._id);
    const orderId = key(line.vendorOrderId);
    if (
      !demandIds.has(demandId) ||
      linkedDemandLines.has(`${demandId}:${lineId}`) ||
      !committedOrderIds.has(orderId)
    ) {
      continue;
    }
    countedOrders.add(orderId);
    countedLines.add(lineId);
    cost += amount(line.orderedQuantity) * amount(line.unitCost);
  }

  return {
    cost,
    orderCount: countedOrders.size,
    lineCount: countedLines.size,
  };
}

function calculateLaborCost(
  eventId: string,
  payrollInputs: readonly ProfitabilityPayrollInput[],
) {
  let cost = 0;
  let totalMinutes = 0;
  let unpricedMinutes = 0;
  let inputCount = 0;

  for (const input of payrollInputs) {
    if (
      !isActive(input) ||
      key(input.eventId) !== eventId ||
      !REVIEWED_PAYROLL_STATUSES.has(key(input.status))
    ) {
      continue;
    }
    inputCount += 1;
    const regularMinutes = Math.max(0, amount(input.regularMinutes));
    const overtimeMinutes = Math.max(0, amount(input.overtimeMinutes));
    const statedTotal = Math.max(0, amount(input.totalMinutes));
    const minutes = statedTotal || regularMinutes + overtimeMinutes;
    const grossAmount = numberOrNull(input.grossAmount);
    const hourlyRate = numberOrNull(input.hourlyRate);
    const overtimeRate = numberOrNull(input.overtimeRate);
    totalMinutes += minutes;

    if (grossAmount != null) {
      cost += Math.max(0, grossAmount);
      continue;
    }
    if (hourlyRate != null) cost += (regularMinutes / 60) * hourlyRate;
    else unpricedMinutes += regularMinutes;
    if (overtimeRate != null) cost += (overtimeMinutes / 60) * overtimeRate;
    else unpricedMinutes += overtimeMinutes;
  }

  return { cost, totalMinutes, unpricedMinutes, inputCount };
}

function calculateEquipmentCost(
  eventId: string,
  equipment: readonly ProfitabilityEquipment[],
  reservations: readonly ProfitabilityEquipmentReservation[],
) {
  const equipmentById = new Map(
    equipment.filter(isActive).map((item) => [key(item._id), item] as const),
  );
  let cost = 0;
  let reservationCount = 0;
  let rentalReservationCount = 0;
  let unpricedRentalReservationCount = 0;

  for (const reservation of reservations) {
    if (
      !isActive(reservation) ||
      key(reservation.eventId) !== eventId ||
      !ACTIVE_RESERVATION_STATUSES.has(key(reservation.status))
    ) {
      continue;
    }
    reservationCount += 1;
    const item = equipmentById.get(key(reservation.equipmentId));
    if (!item || key(item.ownership) !== "rented") continue;
    rentalReservationCount += 1;
    const unitValue = numberOrNull(item.purchaseValue);
    if (unitValue == null || unitValue <= 0) {
      unpricedRentalReservationCount += 1;
      continue;
    }
    cost += Math.max(0, amount(reservation.quantity)) * unitValue;
  }

  return {
    cost,
    reservationCount,
    rentalReservationCount,
    unpricedRentalReservationCount,
  };
}

export type ClockedLaborSummary = {
  cost: number;
  totalMinutes: number;
  unpricedMinutes: number;
  recordCount: number;
  peopleMissingRates: readonly string[];
  scheduledMinutes?: number;
  scheduledCost?: number;
  scheduledShiftCount?: number;
};

export function buildLiveEventProfitability({
  eventId,
  invoices,
  demands,
  orders,
  lines,
  lineDemands,
  payrollInputs,
  equipment,
  equipmentReservations,
  clockedLabor,
}: {
  eventId: string;
  invoices: readonly ProfitabilityInvoice[];
  demands: readonly ProfitabilityIngredientDemand[];
  orders: readonly ProfitabilityVendorOrder[];
  lines: readonly ProfitabilityVendorOrderLine[];
  lineDemands: readonly ProfitabilityVendorOrderLineDemand[];
  payrollInputs: readonly ProfitabilityPayrollInput[];
  equipment: readonly ProfitabilityEquipment[];
  equipmentReservations: readonly ProfitabilityEquipmentReservation[];
  /**
   * Live clocked-hours labor from the laborSummary seam. When present with
   * records it is the labor source; payroll inputs are the fallback only.
   * (Generated queries strip PayrollInput's encrypted rate fields, so
   * payroll-input pricing is blind to rates on the client — issue #76.)
   */
  clockedLabor?: ClockedLaborSummary | null;
}): LiveEventProfitability {
  const eventKey = key(eventId);
  const includedInvoices = invoices.filter(
    (invoice) =>
      isActive(invoice) &&
      key(invoice.eventId) === eventKey &&
      invoice.issuedAt != null &&
      !EXCLUDED_INVOICE_STATUSES.has(key(invoice.status)),
  );
  const confirmedRevenue = includedInvoices.reduce(
    (sum, invoice) => sum + amount(invoice.total),
    0,
  );
  const ingredient = calculateIngredientCost({
    eventId: eventKey,
    demands,
    orders,
    lines,
    lineDemands,
  });
  const payrollLabor = calculateLaborCost(eventKey, payrollInputs);
  const useClocked = clockedLabor != null && clockedLabor.recordCount > 0;
  // Before anyone clocks in, the scheduled-shift forecast (shifts × rates)
  // is the best labor number — the same figure a staffing worksheet prints.
  const useScheduled =
    !useClocked &&
    payrollLabor.inputCount === 0 &&
    (clockedLabor?.scheduledShiftCount ?? 0) > 0;
  const labor = useClocked
    ? {
        cost: clockedLabor.cost,
        totalMinutes: clockedLabor.totalMinutes,
        unpricedMinutes: clockedLabor.unpricedMinutes,
        inputCount: clockedLabor.recordCount,
      }
    : useScheduled
      ? {
          cost: clockedLabor!.scheduledCost ?? 0,
          totalMinutes: clockedLabor!.scheduledMinutes ?? 0,
          unpricedMinutes: 0,
          inputCount: clockedLabor!.scheduledShiftCount ?? 0,
        }
      : payrollLabor;
  const equipmentTotal = calculateEquipmentCost(
    eventKey,
    equipment,
    equipmentReservations,
  );
  const totalCommittedCost = ingredient.cost + labor.cost + equipmentTotal.cost;
  const margin = confirmedRevenue - totalCommittedCost;
  const hasIncompletePricing =
    labor.unpricedMinutes > 0 ||
    equipmentTotal.unpricedRentalReservationCount > 0;

  return {
    confirmedRevenue,
    ingredientCost: ingredient.cost,
    laborCost: labor.cost,
    equipmentCost: equipmentTotal.cost,
    totalCommittedCost,
    margin,
    marginPercent:
      confirmedRevenue > 0 ? (margin / confirmedRevenue) * 100 : null,
    invoiceCount: includedInvoices.length,
    ingredientOrderCount: ingredient.orderCount,
    ingredientLineCount: ingredient.lineCount,
    payrollInputCount: labor.inputCount,
    laborHours: labor.totalMinutes / 60,
    unpricedLaborHours: labor.unpricedMinutes / 60,
    equipmentReservationCount: equipmentTotal.reservationCount,
    rentalReservationCount: equipmentTotal.rentalReservationCount,
    unpricedRentalReservationCount:
      equipmentTotal.unpricedRentalReservationCount,
    hasIncompletePricing,
  };
}
