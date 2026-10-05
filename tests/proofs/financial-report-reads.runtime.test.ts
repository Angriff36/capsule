/**
 * Runtime proof (PL-AUTH, AC-212 financial report reads): each money report
 * (tppReports.financial.run) opens only for a caller who may read its main
 * records; names joined in from other records (client, event, Venue record,
 * ingredient, vendor, staff member) show only when the caller may read those
 * too; removed joined records never show. Every report family is run over
 * seeded records. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;
type Report = {
  kind: string;
  rows: Array<{ values: Record<string, unknown> }>;
};

const DENIED = /can't open this money report/;
const tenantId = "tenant-financial-report-reads";
const day = Date.UTC(2026, 8, 20);

function run(actor: Actor, reportId: string) {
  return actor.query(api.tppReports.financial.run, {
    reportId,
    parameters: {},
  }) as Promise<Report>;
}
async function rows(actor: Actor, reportId: string) {
  const report = await run(actor, reportId);
  expect(report.kind).toBe("financial");
  return report.rows.map((row) => row.values);
}
async function refused(actor: Actor, reportId: string) {
  await expect(run(actor, reportId)).rejects.toThrow(DENIED);
}

async function seed(owner: Actor) {
  await owner.run(async (ctx) => {
    const base = {
      tenantId,
      version: 1,
      createdAt: day,
      updatedAt: day,
      deletedAt: null,
    };
    const insert = (table: string, doc: Record<string, unknown>) =>
      ctx.db.insert(table as never, { ...base, ...doc } as never);
    const clientId = await insert("clients", {
      clientType: "company",
      companyName: "Harbor Foods",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
    });
    const venueId = await insert("venues", {
      name: "Pier Hall",
      venueType: "banquet_hall",
      addressLine1: "9 Pier Street",
      capacity: 200,
      status: "active",
    });
    // Harbor Gala carries only the Venue record link; Snapshot Dinner keeps
    // its own venue name on the event.
    const eventId = await insert("events", {
      title: "Harbor Gala",
      eventType: "gala",
      stage: "planning",
      startsAt: day,
      venueId: String(venueId),
    });
    const snapshotEventId = await insert("events", {
      title: "Snapshot Dinner",
      eventType: "dinner",
      stage: "planning",
      startsAt: day,
      venueName: "Lakeside Pavilion",
    });
    await insert("events", {
      title: "Lost Party",
      eventType: "party",
      stage: "cancelled",
      startsAt: day,
      cancellationReason: "Budget",
      quotedPrice: 900,
    });
    const removedEventId = await insert("events", {
      title: "Removed Dinner",
      eventType: "dinner",
      stage: "planning",
      startsAt: day,
      deletedAt: day,
    });
    const invoiceId = await insert("invoices", {
      clientId,
      eventId,
      invoiceNumber: "INV-HARBOR",
      status: "sent",
      issuedAt: day,
      subtotal: 4200,
      taxAmount: 0,
      discountAmount: 0,
      total: 4200,
      amountPaid: 0,
      amountDue: 4200,
      depositAmount: 500,
      paymentTermsDays: 30,
      lineItems: [
        {
          description: "House wine",
          category: "beverage",
          quantity: 10,
          unitPrice: 20,
          unitCost: 8,
        },
      ],
    });
    await insert("invoices", {
      clientId,
      eventId: snapshotEventId,
      invoiceNumber: "INV-SNAP",
      status: "sent",
      issuedAt: day,
      subtotal: 1000,
      taxAmount: 0,
      discountAmount: 0,
      total: 1000,
      amountPaid: 0,
      amountDue: 1000,
      paymentTermsDays: 30,
    });
    await insert("payments", {
      invoiceId,
      clientId,
      amount: 500,
      method: "card",
      status: "completed",
      reconciliationStatus: "matched",
      settledAt: day,
      recordedAt: day,
    });
    await insert("proposals", {
      clientId,
      title: "Harbor Gala proposal",
      proposalNumber: "P-HARBOR",
      status: "sent",
      eventDate: day,
      guestCount: 120,
      subtotal: 4200,
      taxAmount: 0,
      discountAmount: 0,
      total: 4200,
    });
    const ingredientId = await insert("ingredients", {
      name: "Basil",
      unit: "ounce",
      costPerUnit: 4,
      status: "active",
    });
    const vendorId = await insert("vendors", {
      name: "Green Farm",
      paymentTermsDays: 30,
      status: "active",
    });
    const goneIngredientId = await insert("ingredients", {
      name: "Old Thyme",
      unit: "ounce",
      costPerUnit: 7,
      status: "active",
      deletedAt: day,
    });
    const goneVendorId = await insert("vendors", {
      name: "Gone Vendor",
      paymentTermsDays: 30,
      status: "active",
      deletedAt: day,
    });
    const vendorOrderId = await insert("vendorOrders", {
      vendorId,
      subtotal: 9,
      taxAmount: 0,
      shippingAmount: 0,
      totalAmount: 9,
      status: "received",
    });
    const vendorOrderLineId = await insert("vendorOrderLines", {
      vendorOrderId,
      ingredientId,
      orderedQuantity: 2,
      receivedQuantity: 2,
      unit: "ounce",
      unitCost: 4.5,
      status: "complete",
    });
    const observations: Array<[unknown, unknown, number, number]> = [
      [ingredientId, vendorId, day - 86_400_000, 4],
      [ingredientId, vendorId, day, 5],
      [goneIngredientId, goneVendorId, day - 86_400_000, 7],
      [goneIngredientId, goneVendorId, day, 8],
    ];
    for (const [ingredient, vendor, observedAt, unitPrice] of observations)
      await insert("ingredientPriceObservations", {
        ingredientId: ingredient,
        vendorId: vendor,
        vendorOrderId,
        vendorOrderLineId,
        receiptQuantity: 1,
        cumulativeReceivedQuantity: 1,
        unit: "ounce",
        unitPrice,
        observedAt,
      });
    await insert("eventCloseouts", {
      eventId,
      status: "finalized",
      actualRevenue: 4200,
      budgetedRevenue: 4200,
      revenueVariance: 0,
      actualIngredientCost: 1000,
      actualWasteCost: 100,
      actualLaborCost: 800,
      actualVendorCost: 300,
      budgetedCost: 2200,
      totalActualCost: 2200,
      costVariance: 0,
      grossProfit: 2000,
      expectedHeadcount: 120,
      actualHeadcount: 120,
    });
    const person = (givenName: string, familyName: string, extra = {}) =>
      insert("people", {
        givenName,
        familyName,
        email: `${givenName.toLowerCase()}@example.test`,
        role: "kitchen_staff",
        employmentType: "part_time",
        status: "active",
        ...extra,
      });
    const payroll = (personId: unknown, forEvent: unknown, gross: string) =>
      insert("payrollInputs", {
        personId,
        eventId: forEvent,
        status: "finalized",
        periodStart: day - 86_400_000,
        periodEnd: day,
        regularMinutes: 480,
        overtimeMinutes: 60,
        totalMinutes: 540,
        grossAmount: gross,
      });
    await payroll(await person("Rosa", "Line"), eventId, "240");
    await payroll(
      await person("Old", "Hand", { deletedAt: day }),
      removedEventId,
      "100",
    );
  });
}

describe("runtime proof: money reports follow the read policy (AC-212)", () => {
  it("opens each report family only for roles that may read its records, and blanks joined names they may not read or that were removed", async () => {
    const proof = harness();
    const as = (role: string) =>
      proof.asRole({ subject: "financial-report-" + role, role, tenantId });
    await seed(as("owner"));

    // A/R (invoiceRead: finance or any manager). The client name needs
    // salesAccess or financeAccess.
    const receivable = (contact: string) =>
      expect.arrayContaining([
        expect.objectContaining({
          contact,
          invoice: "INV-HARBOR",
          balance: 4200,
        }),
        expect.objectContaining({
          contact,
          invoice: "INV-SNAP",
          balance: 1000,
        }),
      ]);
    expect(await rows(as("finance_staff"), "accounts-receivable")).toEqual(
      receivable("Harbor Foods"),
    );
    expect(await rows(as("event_manager"), "accounts-receivable")).toEqual(
      receivable(""),
    );
    for (const role of ["driver", "kitchen_staff", "sales_staff"])
      await refused(as(role), "accounts-receivable");

    // Deposits (invoiceRead): an event manager sees the deposit and the
    // event but not the client.
    expect(await rows(as("finance_staff"), "outstanding-deposits")).toEqual([
      expect.objectContaining({
        event: "Harbor Gala",
        contact: "Harbor Foods",
        deposit: 500,
      }),
    ]);
    expect(await rows(as("event_manager"), "outstanding-deposits")).toEqual([
      expect.objectContaining({
        event: "Harbor Gala",
        contact: "",
        deposit: 500,
      }),
    ]);
    for (const role of ["driver", "kitchen_staff", "sales_staff"])
      await refused(as(role), "outstanding-deposits");

    // Invoice line items (invoiceRead).
    const wine = (contact: string) => [
      expect.objectContaining({
        event: "Harbor Gala",
        contact,
        invoice: "INV-HARBOR",
        item: "House wine",
        sales: 200,
        cost: 80,
      }),
    ];
    expect(await rows(as("finance_staff"), "beverage-costs")).toEqual(
      wine("Harbor Foods"),
    );
    expect(await rows(as("event_manager"), "beverage-costs")).toEqual(wine(""));
    for (const role of ["driver", "kitchen_staff", "sales_staff"])
      await refused(as(role), "beverage-costs");

    // Revenue by venue (invoiceRead). Filling the venue from the Venue
    // record needs venueRead (eventAccess); the event's own venue name
    // follows eventRead and stays for finance.
    const venues = async (role: string) =>
      Object.fromEntries(
        (await rows(as(role), "venue-sales")).map((row) => [
          row.event,
          row.venue,
        ]),
      );
    expect(await venues("finance_staff")).toEqual({
      "Harbor Gala": "",
      "Snapshot Dinner": "Lakeside Pavilion",
    });
    expect(await venues("event_manager")).toEqual({
      "Harbor Gala": "Pier Hall",
      "Snapshot Dinner": "Lakeside Pavilion",
    });
    for (const role of ["driver", "kitchen_staff", "sales_staff"])
      await refused(as(role), "venue-sales");

    // Payment reports (paymentRead: finance only).
    expect(await rows(as("finance_staff"), "contact-payments")).toEqual([
      expect.objectContaining({ contact: "Harbor Foods", amount: 500 }),
    ]);
    expect(await rows(as("finance_staff"), "credit-card-transactions")).toEqual(
      [expect.objectContaining({ method: "card", amount: 500 })],
    );
    expect(await rows(as("finance_staff"), "payment-totals")).toEqual([
      { method: "card", amount: 500 },
    ]);
    for (const reportId of [
      "contact-payments",
      "credit-card-transactions",
      "payment-totals",
    ])
      for (const role of ["event_manager", "sales_staff", "driver"])
        await refused(as(role), reportId);

    // Open proposals (proposalRead: sales).
    expect(await rows(as("sales_staff"), "outstanding-proposals")).toEqual([
      expect.objectContaining({
        proposal: "P-HARBOR",
        contact: "Harbor Foods",
      }),
    ]);
    for (const role of ["finance_staff", "driver", "kitchen_staff"])
      await refused(as(role), "outstanding-proposals");

    // Ingredient cost changes (kitchen, purchasing or managers). Vendor names
    // need procurementAccess; a removed ingredient or vendor never shows.
    const costs = async (role: string) =>
      (await rows(as(role), "inventory-cost-changes"))
        .map((row) => [row.item, row.vendor, row.first, row.latest])
        .sort((a, b) => Number(a[2]) - Number(b[2]));
    expect(await costs("owner")).toEqual([
      ["Basil", "Green Farm", 4, 5],
      ["", "", 7, 8],
    ]);
    expect(await costs("kitchen_staff")).toEqual([
      ["Basil", "", 4, 5],
      ["", "", 7, 8],
    ]);
    expect(await costs("procurement_staff")).toEqual([
      ["Basil", "Green Farm", 4, 5],
      ["", "", 7, 8],
    ]);
    await refused(as("driver"), "inventory-cost-changes");

    // Profit reports (eventCloseoutRead: finance or event managers).
    for (const role of ["finance_staff", "event_manager"])
      for (const reportId of ["profit-summary", "event-food-costing-summary"])
        expect(await rows(as(role), reportId)).toEqual([
          expect.objectContaining({ event: "Harbor Gala", profit: 2000 }),
        ]);
    for (const role of [
      "sales_manager",
      "kitchen_manager",
      "workforce_manager",
      "driver",
    ])
      await refused(as(role), "profit-summary");

    // Staff earnings (payrollInputRead: finance managers). A removed staff
    // member or event never shows by name.
    const earnings = await rows(as("finance_manager"), "staff-earnings");
    expect(earnings).toHaveLength(2);
    expect(earnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staff: "Rosa Line",
          event: "Harbor Gala",
          earnings: 240,
        }),
        expect.objectContaining({ staff: "", event: "", earnings: 100 }),
      ]),
    );
    for (const role of ["workforce_manager", "event_manager", "finance_staff"])
      await refused(as(role), "staff-earnings");

    // Lost revenue (eventRead: any staff member).
    for (const role of ["driver", "kitchen_staff"])
      expect(
        await rows(as(role), "lost-revenue-by-cancellation-reason"),
      ).toEqual([
        expect.objectContaining({
          event: "Lost Party",
          reason: "Budget",
          revenue: 900,
        }),
      ]);
  });
});
