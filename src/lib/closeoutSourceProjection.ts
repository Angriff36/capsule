// PL-CLOSEOUT (spec §15.3 / §15.5, AC-625, AC-628, AC-386): the closeout
// numbers of one event, worked out from the records Capsule already has.
//
// Every line says what was planned, what the records add up to, whether that
// answer is complete, and which records it came from (table, id, version,
// amount). A line with no records is left open (actual = null), never a
// made-up zero - except the costs an event may truly not have (waste, outside
// vendors, commission), where "nothing recorded" is a complete zero.
//
// Pure: convex/closeoutSources.ts loads the rows and calls this.

import {
  decodeAnswers,
  keptLeftovers,
  LEFTOVER_HANDLING_LABEL,
  type MudaAnswers,
} from "./eventPacket/finalLock/fieldFormAnswers";

export type CloseoutLineKey =
  | "revenue"
  | "ingredient"
  | "waste"
  | "labor"
  | "vendor"
  | "commission"
  | "transport"
  | "headcount";

export type CloseoutSourceRecord = {
  table: string;
  id: string;
  version: number | null;
  amount: number;
  label: string;
};

export type CloseoutLine = {
  key: CloseoutLineKey;
  label: string;
  planned: number | null;
  actual: number | null;
  complete: boolean;
  note: string | null;
  sources: CloseoutSourceRecord[];
};

type Versioned = {
  _id: string;
  version?: number | null;
  deletedAt?: number | null;
};

export type ProjectionInvoice = Versioned & {
  status: string;
  invoiceNumber?: string | null;
  total: number;
  /** Sales tax on the bill: collected for the state, not earned. */
  taxAmount?: number | null;
  amountPaid?: number | null;
  amountDue?: number | null;
  creditMemoAmount?: number | null;
};
export type ProjectionPayment = Versioned & {
  status: string;
  amount: number;
  refundedAmount?: number | null;
  chargedBackAmount?: number | null;
  returnedAmount?: number | null;
};
export type ProjectionCreditMemo = Versioned & {
  status: string;
  amount: number;
};
export type ProjectionVendorOrder = Versioned & {
  status: string;
  orderNumber?: string | null;
  lines: Array<
    Versioned & {
      status: string;
      orderedQuantity: number;
      receivedQuantity: number;
      unitCost: number;
    }
  >;
};
export type ProjectionWaste = Versioned & {
  status: string;
  quantity: number;
  unitCost?: number | null;
};
export type ProjectionTimeRecord = Versioned & { minutes: number };
export type ProjectionLabor = {
  cost: number;
  scheduledCost: number;
  unpricedMinutes: number;
  peopleMissingRates: string[];
  records: ProjectionTimeRecord[];
};
export type ProjectionRental = Versioned & {
  status: string;
  description: string;
  vendorCost: number;
};
export type ProjectionEquipmentIssue = Versioned & {
  kind: string;
  status: string;
  payer: string;
  cost?: number | null;
  chargeAmount?: number | null;
};
export type ProjectionAttribution = Versioned & {
  status: string;
  attributionType: string;
  allocatedAmount: number;
};
export type ProjectionGuest = Versioned & { checkedInAt?: number | null };
/** A signed food waste form (FieldConfirmation "field.muda", status done). */
export type ProjectionFoodWasteForm = Versioned & {
  completedAt?: number | null;
  answers?: string | null;
};
export type ProjectionTruckRun = Versioned & {
  label: string;
  tripCost?: number | null;
};

export type CloseoutProjectionInput = {
  event: {
    quotedPrice?: number | null;
    budgetAmount?: number | null;
    expectedHeadcount?: number | null;
  };
  invoices: ProjectionInvoice[];
  payments: ProjectionPayment[];
  creditMemos: ProjectionCreditMemo[];
  vendorOrders: ProjectionVendorOrder[];
  waste: ProjectionWaste[];
  labor: ProjectionLabor | null;
  rentals: ProjectionRental[];
  equipmentIssues: ProjectionEquipmentIssue[];
  attributions: ProjectionAttribution[];
  guests: ProjectionGuest[];
  /** The event's truck runs and vendor drops still on it (not released). */
  truckRuns?: ProjectionTruckRun[];
  /** The event's signed food waste forms (the paper "Event Food MUDA"). */
  foodWasteForms?: ProjectionFoodWasteForm[];
};

export type CloseoutCaptureValues = {
  actualRevenue: number;
  budgetedRevenue: number;
  revenueVariance: number;
  actualIngredientCost: number;
  actualWasteCost: number;
  actualLaborCost: number;
  actualVendorCost: number;
  budgetedCost: number;
  totalActualCost: number;
  costVariance: number;
  grossProfit: number;
  expectedHeadcount: number;
  actualHeadcount: number;
};

export type CloseoutProjection = {
  lines: CloseoutLine[];
  complete: boolean;
  incomplete: CloseoutLineKey[];
  /** Money received (net of refunds, chargebacks and returns). */
  payments: CloseoutSourceRecord[];
  billed: number;
  collected: number;
  outstanding: number;
  budgetedRevenue: number;
  budgetedCost: number;
};

const BILLED = new Set(["sent", "viewed", "overdue", "partial", "paid"]);
const SETTLED_PAYMENT = new Set([
  "completed",
  "refunded",
  "charged_back",
  "returned",
]);
const RECEIVING_ORDER = new Set(["partially_received", "received"]);
const APPROVED_ATTRIBUTION = new Set(["approved", "applied"]);
const WAITING_ATTRIBUTION = new Set(["draft", "pending_approval"]);

const cents = (value: number | null | undefined) =>
  Math.round(Number(value ?? 0) * 100);
const money = (centsValue: number) => centsValue / 100;
const live = <T extends Versioned>(rows: readonly T[]) =>
  rows.filter((row) => row.deletedAt == null);
const ref = (
  table: string,
  row: Versioned,
  amountCents: number,
  label: string,
): CloseoutSourceRecord => ({
  table,
  id: String(row._id),
  version: row.version ?? null,
  amount: money(amountCents),
  label,
});
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function revenueLine(input: CloseoutProjectionInput) {
  const invoices = live(input.invoices);
  const billed = invoices.filter((row) => BILLED.has(row.status));
  const drafts = invoices.filter((row) => row.status === "draft");
  const sources: CloseoutSourceRecord[] = [];
  let earned = 0;
  let billedCents = 0;
  let outstanding = 0;
  // Revenue = billed invoice totals less their sales tax (owed to the state,
  // not earned) and less the credits given back on them
  // (Invoice.creditMemoAmount). The credit rows are listed so the sources
  // add up to the line; payments are the collected side, listed apart.
  for (const invoice of billed) {
    const beforeTax = cents(invoice.total) - cents(invoice.taxAmount);
    earned += beforeTax - cents(invoice.creditMemoAmount);
    billedCents += cents(invoice.total);
    outstanding += cents(invoice.amountDue);
    sources.push(
      ref(
        "invoices",
        invoice,
        beforeTax,
        `Invoice ${invoice.invoiceNumber || ""}`.trim() +
          (cents(invoice.taxAmount) > 0 ? " (before sales tax)" : ""),
      ),
    );
  }
  for (const memo of live(input.creditMemos)) {
    if (memo.status === "draft") continue;
    sources.push(ref("creditMemos", memo, -cents(memo.amount), "Credit given"));
  }
  let collected = 0;
  const payments: CloseoutSourceRecord[] = [];
  for (const payment of live(input.payments)) {
    if (!SETTLED_PAYMENT.has(payment.status)) continue;
    const net =
      cents(payment.amount) -
      cents(payment.refundedAmount) -
      cents(payment.chargedBackAmount) -
      cents(payment.returnedAmount);
    collected += net;
    payments.push(ref("payments", payment, net, "Payment received"));
  }
  const notes: string[] = [];
  if (billed.length === 0) notes.push("No invoice has been sent yet");
  if (drafts.length > 0)
    notes.push(`${plural(drafts.length, "draft invoice")} not sent yet`);
  const line: CloseoutLine = {
    key: "revenue",
    label: "Revenue",
    planned: input.event.quotedPrice ?? null,
    actual: billed.length > 0 ? money(earned) : null,
    complete: billed.length > 0 && drafts.length === 0,
    note: notes.length > 0 ? notes.join(". ") : null,
    sources,
  };
  return {
    line,
    payments,
    billed: money(billedCents),
    collected: money(collected),
    outstanding: money(outstanding),
  };
}

function ingredientLine(input: CloseoutProjectionInput): CloseoutLine {
  const sources: CloseoutSourceRecord[] = [];
  let planned = 0;
  let received = 0;
  let waiting = 0;
  for (const order of live(input.vendorOrders)) {
    if (order.status === "cancelled" || order.status === "draft") continue;
    const receiving = RECEIVING_ORDER.has(order.status);
    // A partly received order still counts what came, but the line stays open.
    if (order.status !== "received") waiting += 1;
    for (const line of live(order.lines)) {
      if (line.status === "cancelled") continue;
      planned += cents(line.orderedQuantity * line.unitCost);
      if (!receiving) continue;
      const amount = cents(line.receivedQuantity * line.unitCost);
      received += amount;
      sources.push(
        ref(
          "vendorOrderLines",
          line,
          amount,
          `Received on order ${order.orderNumber || ""}`.trim(),
        ),
      );
    }
  }
  const notes: string[] = [];
  if (sources.length === 0)
    notes.push("No food deliveries received for this event");
  if (waiting > 0)
    notes.push(`${plural(waiting, "order")} not fully received yet`);
  return {
    key: "ingredient",
    label: "Food cost",
    planned: planned > 0 ? money(planned) : null,
    actual: sources.length > 0 ? money(received) : null,
    complete: sources.length > 0 && waiting === 0,
    note: notes.length > 0 ? notes.join(". ") : null,
    sources,
  };
}

// The newest signed food waste form with readable answers. The lead's counts
// are servings and pounds, not money, so they are listed beside the waste
// line and give the guest count when nobody checked guests in.
function foodWasteForm(input: CloseoutProjectionInput) {
  let newest: { form: ProjectionFoodWasteForm; muda: MudaAnswers } | null =
    null;
  for (const form of live(input.foodWasteForms ?? [])) {
    const answers = decodeAnswers(form.answers);
    if (answers?.kind !== "muda") continue;
    if (newest && (newest.form.completedAt ?? 0) >= (form.completedAt ?? 0))
      continue;
    newest = { form, muda: answers.muda };
  }
  return newest;
}

function leftoverText(muda: MudaAnswers) {
  const left = keptLeftovers(muda).map((l) =>
    l.kind === "appetizer"
      ? `${l.item} ${plural(l.amount, "serving")}`
      : `${l.item} ${l.amount} lb`,
  );
  const parts = [
    left.length > 0 ? `Left over: ${left.join(", ")}` : "Nothing left over",
  ];
  if (muda.mainsHandling)
    parts.push(LEFTOVER_HANDLING_LABEL[muda.mainsHandling].toLowerCase());
  if (muda.staffError)
    parts.push(
      `staff mistake${muda.staffErrorNote.trim() ? `: ${muda.staffErrorNote.trim()}` : ""}`,
    );
  return parts.join(" · ");
}

function wasteLine(input: CloseoutProjectionInput): CloseoutLine {
  const sources: CloseoutSourceRecord[] = [];
  let total = 0;
  let pending = 0;
  for (const row of live(input.waste)) {
    if (row.status === "pending") pending += 1;
    if (row.status !== "recorded") continue;
    const amount = cents(row.quantity * Number(row.unitCost ?? 0));
    total += amount;
    sources.push(ref("wasteRecords", row, amount, "Waste logged"));
  }
  const form = foodWasteForm(input);
  if (form)
    sources.push(
      ref("fieldConfirmations", form.form, 0, leftoverText(form.muda)),
    );
  return {
    key: "waste",
    label: "Waste",
    planned: null,
    actual: money(total),
    complete: pending === 0,
    note:
      pending > 0
        ? `${plural(pending, "waste entry")} not confirmed yet`
        : null,
    sources,
  };
}

function laborLine(input: CloseoutProjectionInput): CloseoutLine {
  const labor = input.labor;
  if (labor == null) {
    return {
      key: "labor",
      label: "Staff time",
      planned: null,
      actual: null,
      complete: false,
      note: "Staff time is not available to you",
      sources: [],
    };
  }
  const sources = labor.records.map((record) =>
    ref("timeRecords", record, 0, `${Math.round(record.minutes)} min worked`),
  );
  const notes: string[] = [];
  if (sources.length === 0) notes.push("No one clocked time for this event");
  if (labor.peopleMissingRates.length > 0)
    notes.push(`No pay rate for ${labor.peopleMissingRates.join(", ")}`);
  return {
    key: "labor",
    label: "Staff time",
    planned: labor.scheduledCost > 0 ? labor.scheduledCost : null,
    actual: sources.length > 0 ? labor.cost : null,
    complete: sources.length > 0 && labor.peopleMissingRates.length === 0,
    note: notes.length > 0 ? notes.join(". ") : null,
    sources,
  };
}

function vendorLine(input: CloseoutProjectionInput): CloseoutLine {
  const sources: CloseoutSourceRecord[] = [];
  let planned = 0;
  let actual = 0;
  let unconfirmed = 0;
  for (const rental of live(input.rentals)) {
    if (rental.status === "cancelled") continue;
    const amount = cents(rental.vendorCost);
    planned += amount;
    actual += amount;
    if (rental.status === "requested") unconfirmed += 1;
    sources.push(ref("rentalOrderLines", rental, amount, rental.description));
  }
  let undecided = 0;
  for (const issue of live(input.equipmentIssues)) {
    if (issue.payer === "undecided") undecided += 1;
    const amount = cents(issue.cost);
    if (amount === 0) continue;
    actual += amount;
    sources.push(
      ref("equipmentIssues", issue, amount, `Equipment ${issue.kind}`),
    );
  }
  const notes: string[] = [];
  if (unconfirmed > 0)
    notes.push(`${plural(unconfirmed, "rental")} not confirmed by the vendor`);
  if (undecided > 0)
    notes.push(
      `${plural(undecided, "equipment problem")} still needs someone to say who pays`,
    );
  return {
    key: "vendor",
    label: "Rentals and equipment",
    planned: planned > 0 ? money(planned) : null,
    actual: money(actual),
    complete: unconfirmed === 0 && undecided === 0,
    note: notes.length > 0 ? notes.join(". ") : null,
    sources,
  };
}

function commissionLine(input: CloseoutProjectionInput): CloseoutLine {
  const sources: CloseoutSourceRecord[] = [];
  let total = 0;
  let waiting = 0;
  for (const row of live(input.attributions)) {
    if (WAITING_ATTRIBUTION.has(row.status)) waiting += 1;
    if (!APPROVED_ATTRIBUTION.has(row.status)) continue;
    const amount = cents(row.allocatedAmount);
    total += amount;
    sources.push(
      ref(
        "revenueAttributions",
        row,
        amount,
        row.attributionType.replace(/_/g, " "),
      ),
    );
  }
  return {
    key: "commission",
    label: "Commissions",
    planned: null,
    actual: money(total),
    complete: waiting === 0,
    note:
      waiting > 0
        ? `${plural(waiting, "commission")} still waiting for approval`
        : null,
    sources,
  };
}

// Transport (BE-20.1-20): the trip cost typed on each truck run or vendor drop
// (a hired truck's bill, a delivery fee, fuel and tolls). A run with no cost
// counts as nothing and is named in the note; it does not hold up the
// closeout, the same as an event with no waste.
function transportLine(input: CloseoutProjectionInput): CloseoutLine {
  const sources: CloseoutSourceRecord[] = [];
  let total = 0;
  const unpriced: string[] = [];
  for (const run of live(input.truckRuns ?? [])) {
    if (run.tripCost == null) {
      unpriced.push(run.label);
      continue;
    }
    const amount = cents(run.tripCost);
    total += amount;
    sources.push(ref("eventVehicleAssignments", run, amount, run.label));
  }
  return {
    key: "transport",
    label: "Transport",
    planned: null,
    actual: money(total),
    complete: true,
    note: unpriced.length > 0 ? `No trip cost on ${unpriced.join(", ")}` : null,
    sources,
  };
}

function headcountLine(input: CloseoutProjectionInput): CloseoutLine {
  const checkedIn = live(input.guests).filter(
    (guest) => guest.checkedInAt != null,
  );
  // Guests checked in one by one beat the lead's estimate; with no check-in,
  // the count on the signed food waste form answers the line.
  const form = checkedIn.length === 0 ? foodWasteForm(input) : null;
  const counted = form?.muda.attendance;
  if (form && counted != null && Number.isFinite(counted) && counted >= 0) {
    return {
      key: "headcount",
      label: "Guests who came",
      planned: input.event.expectedHeadcount ?? null,
      actual: Math.trunc(counted),
      complete: true,
      note: "Counted on the food waste form",
      sources: [
        ref("fieldConfirmations", form.form, 0, "Guests counted by the lead"),
      ],
    };
  }
  return {
    key: "headcount",
    label: "Guests who came",
    planned: input.event.expectedHeadcount ?? null,
    actual: checkedIn.length > 0 ? checkedIn.length : null,
    complete: checkedIn.length > 0,
    note: checkedIn.length > 0 ? null : "No guests were checked in",
    sources: checkedIn.map((guest) =>
      ref("eventGuests", guest, 0, "Checked in"),
    ),
  };
}

export function projectCloseoutSources(
  input: CloseoutProjectionInput,
): CloseoutProjection {
  const revenue = revenueLine(input);
  const lines = [
    revenue.line,
    ingredientLine(input),
    wasteLine(input),
    laborLine(input),
    vendorLine(input),
    commissionLine(input),
    transportLine(input),
    headcountLine(input),
  ];
  const incomplete = lines.filter((line) => !line.complete).map((l) => l.key);
  return {
    lines,
    complete: incomplete.length === 0,
    incomplete,
    payments: revenue.payments,
    billed: revenue.billed,
    collected: revenue.collected,
    outstanding: revenue.outstanding,
    budgetedRevenue: Number(input.event.quotedPrice ?? 0),
    budgetedCost: Number(input.event.budgetAmount ?? 0),
  };
}

/**
 * The capture numbers: each line's record total, or the amount a person
 * entered for a line the records cannot answer. A line with neither is an
 * error - Capsule never stores a made-up zero. Commission and transport are
 * costs, so they are added to the "vendor and other" amount the closeout
 * stores.
 */
export function closeoutCaptureValues(
  projection: CloseoutProjection,
  entered: Partial<Record<CloseoutLineKey, number>>,
): { values: CloseoutCaptureValues; enteredKeys: CloseoutLineKey[] } {
  const enteredKeys: CloseoutLineKey[] = [];
  const amount = (key: CloseoutLineKey): number => {
    const line = projection.lines.find((row) => row.key === key)!;
    const typed = entered[key];
    if (!line.complete && typed != null && Number.isFinite(typed)) {
      if (typed < 0) throw new Error(`${line.label} can't be negative.`);
      enteredKeys.push(key);
      return typed;
    }
    // An open line with a partial record total needs a typed total: the partial
    // amount alone would understate the event's result.
    if (line.actual != null && line.complete) return line.actual;
    if (line.actual != null)
      throw new Error(
        `Enter ${line.label.toLowerCase()} - ${line.note ?? "the records are not complete yet"}.`,
      );
    throw new Error(
      `Enter ${line.label.toLowerCase()} - Capsule has no records for it yet.`,
    );
  };
  const actualRevenue = amount("revenue");
  const actualIngredientCost = amount("ingredient");
  const actualWasteCost = amount("waste");
  const actualLaborCost = amount("labor");
  const actualVendorCost = money(
    cents(amount("vendor")) +
      cents(amount("commission")) +
      cents(amount("transport")),
  );
  const actualHeadcount = Math.trunc(amount("headcount"));
  const totalActualCost = money(
    cents(actualIngredientCost) +
      cents(actualWasteCost) +
      cents(actualLaborCost) +
      cents(actualVendorCost),
  );
  const budgetedRevenue = projection.budgetedRevenue;
  const budgetedCost = projection.budgetedCost;
  const planned = projection.lines.find((row) => row.key === "headcount");
  return {
    enteredKeys,
    values: {
      actualRevenue,
      budgetedRevenue,
      revenueVariance: money(cents(budgetedRevenue) - cents(actualRevenue)),
      actualIngredientCost,
      actualWasteCost,
      actualLaborCost,
      actualVendorCost,
      budgetedCost,
      totalActualCost,
      costVariance: money(cents(budgetedCost) - cents(totalActualCost)),
      grossProfit: money(cents(actualRevenue) - cents(totalActualCost)),
      expectedHeadcount: Math.trunc(Number(planned?.planned ?? 0)),
      actualHeadcount,
    },
  };
}

/** The frozen record list stored with the closeout (ids, versions, amounts). */
export function closeoutSourceSnapshot(
  projection: CloseoutProjection,
  enteredKeys: readonly CloseoutLineKey[],
  entered: Partial<Record<CloseoutLineKey, number>>,
): string {
  return JSON.stringify({
    billed: projection.billed,
    collected: projection.collected,
    outstanding: projection.outstanding,
    payments: projection.payments.map(({ table, id, version, amount }) => ({
      table,
      id,
      version,
      amount,
    })),
    lines: projection.lines.map((line) => ({
      key: line.key,
      actual: enteredKeys.includes(line.key) ? entered[line.key] : line.actual,
      fromRecords: line.actual,
      complete: line.complete,
      entered: enteredKeys.includes(line.key),
      note: line.note,
      sources: line.sources.map(({ table, id, version, amount }) => ({
        table,
        id,
        version,
        amount,
      })),
    })),
  });
}
