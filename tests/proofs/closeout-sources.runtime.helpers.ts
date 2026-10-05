/**
 * Seed for the PL-CLOSEOUT source proofs (AC-625, AC-626, AC-628, AC-386):
 * a planned event (quote 4500, budget 3000, 40 guests) walked to closed_out,
 * its approval invoice sent and part paid, plus one of each record the
 * closeout reads - a received food order, logged waste, clocked time, a
 * confirmed rental, an approved commission and guest check-ins.
 * Assertion-free; the test files own every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  harness,
  rolesFor,
  walkToStage,
  type Proof,
  type Role,
} from "./plan-vs-fact-finalized-closeout.runtime.helpers";

export { harness, rolesFor, type Proof, type Role };

export const SOURCE = {
  paid: 2000,
  foodOrdered: 10 * 50,
  foodReceived: 8 * 50,
  waste: 2 * 12.5,
  labor: 5 * 30,
  rental: 120,
  commission: 225,
  checkedIn: 2,
} as const;

type Row = Record<string, any>;

export function ensureEncryptionKey() {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
}

export async function eventInvoice(actor: Role, eventId: string) {
  return (await actor.run(async (ctx) =>
    (await ctx.db.query("invoices").collect()).find(
      (row: Row) => row.eventId === eventId && row.deletedAt == null,
    ),
  )) as Row;
}

/** A closed-out event with its approval invoice sent (nothing else). */
export async function closedOutEvent(
  proof: Proof,
  tenantId: string,
  title: string,
  opts: { sendInvoice: boolean } = { sendInvoice: true },
) {
  const { eventId } = await walkToStage(proof, tenantId, "closed_out", title);
  const { finance } = rolesFor(proof, tenantId);
  const invoice = await eventInvoice(finance, eventId);
  if (opts.sendInvoice && invoice) {
    await proof.executeCommand(finance, api.mutations.Invoice_send, {
      docId: invoice._id,
      version: invoice.version,
    } as never);
  }
  return { eventId, invoiceId: invoice ? String(invoice._id) : null };
}

/** One of each closeout source record, written straight to the tables. */
export async function seedSources(
  proof: Proof,
  tenantId: string,
  eventId: string,
  invoiceId: string,
) {
  const { finance } = rolesFor(proof, tenantId);
  return (await finance.run(async (ctx) => {
    const db = ctx.db as any;
    const event = (await db.get(eventId)) as Row;
    const invoice = (await db.get(invoiceId)) as Row;
    const base = { tenantId, version: 1 };
    const payment = await db.insert("payments", {
      ...base,
      invoiceId,
      clientId: event.clientId,
      eventId,
      amount: SOURCE.paid,
      method: "card",
      status: "completed",
      reconciliationStatus: "matched",
    });
    await db.patch(invoiceId, {
      amountPaid: SOURCE.paid,
      amountDue: Number(invoice.total) - SOURCE.paid,
      status: "partial",
    });
    const ingredient = await db.insert("ingredients", {
      ...base,
      name: "Chicken thigh",
      unit: "pound",
      costPerUnit: 50,
      status: "active",
    });
    const location = await db.insert("storageLocations", {
      ...base,
      name: "Walk-in",
      status: "active",
    });
    const vendor = await db.insert("vendors", {
      ...base,
      name: "Proof Foods",
      paymentTermsDays: 30,
      status: "active",
    });
    const order = await db.insert("vendorOrders", {
      ...base,
      vendorId: vendor,
      eventId,
      subtotal: SOURCE.foodOrdered,
      taxAmount: 0,
      shippingAmount: 0,
      totalAmount: SOURCE.foodOrdered,
      status: "received",
    });
    const orderLine = await db.insert("vendorOrderLines", {
      ...base,
      vendorOrderId: order,
      ingredientId: ingredient,
      orderedQuantity: 10,
      receivedQuantity: 8,
      unit: "pound",
      unitCost: 50,
      status: "complete",
    });
    const waste = await db.insert("wasteRecords", {
      ...base,
      eventId,
      ingredientId: ingredient,
      locationId: location,
      quantity: 2,
      unit: "pound",
      reason: "overproduction",
      unitCost: 12.5,
      status: "recorded",
    });
    const person = await db.insert("people", {
      ...base,
      givenName: "Pat",
      familyName: "Server",
      email: "pat@example.test",
      role: "staff",
      employmentType: "part_time",
      status: "active",
      hourlyRate: 30,
    });
    const clockInAt = Date.UTC(2026, 9, 22, 16, 0);
    const time = await db.insert("timeRecords", {
      ...base,
      personId: person,
      eventId,
      status: "closed",
      clockInAt,
      clockOutAt: clockInAt + 5 * 3600_000,
      breakMinutes: 0,
    });
    const rental = await db.insert("rentalOrderLines", {
      ...base,
      eventId,
      vendorId: vendor,
      description: "Tent 20x30",
      quantity: 1,
      countUnit: "each",
      vendorCost: SOURCE.rental,
      status: "confirmed",
    });
    const commission = await db.insert("revenueAttributions", {
      ...base,
      eventId,
      attributionType: "venue_commission",
      allocationMethod: "percent",
      percentBasis: 5,
      fixedAmount: 0,
      allocatedAmount: SOURCE.commission,
      status: "approved",
    });
    const guests = [];
    for (const [name, came] of [
      ["Ann", true],
      ["Bo", true],
      ["Cy", false],
    ] as const) {
      guests.push(
        await db.insert("eventGuests", {
          ...base,
          eventId,
          name,
          specialMealRequired: false,
          rsvpStatus: "confirmed",
          checkedInAt: came ? clockInAt + 3600_000 : null,
        }),
      );
    }
    return {
      invoiceTotal: Number(invoice.total),
      ids: {
        payment: String(payment),
        orderLine: String(orderLine),
        waste: String(waste),
        time: String(time),
        rental: String(rental),
        commission: String(commission),
        guests: guests.map(String),
        ingredient: String(ingredient),
        location: String(location),
      },
    };
  })) as {
    invoiceTotal: number;
    ids: {
      payment: string;
      orderLine: string;
      waste: string;
      time: string;
      rental: string;
      commission: string;
      guests: string[];
      ingredient: string;
      location: string;
    };
  };
}

export type SourceLine = {
  key: string;
  planned: number | null;
  actual: number | null;
  complete: boolean;
  note: string | null;
  sources: Array<{
    table: string;
    id: string;
    version: number | null;
    amount: number;
  }>;
};

export type SourceRead = {
  projection: {
    lines: SourceLine[];
    complete: boolean;
    incomplete: string[];
    payments: SourceLine["sources"];
    billed: number;
    collected: number;
    outstanding: number;
    budgetedRevenue: number;
    budgetedCost: number;
  };
  closeout: {
    _id: string;
    version: number;
    status: string;
    revision: number;
  } | null;
} | null;

export async function readSources(actor: Role, eventId: string) {
  return (await actor.query(api.closeoutSources.eventCloseoutSources, {
    eventId,
  } as never)) as SourceRead;
}

export async function closeoutRow(actor: Role, eventId: string) {
  return (await actor.run(async (ctx) =>
    (await ctx.db.query("eventCloseouts").collect()).find(
      (row: Row) => row.eventId === eventId && row.deletedAt == null,
    ),
  )) as Row;
}
