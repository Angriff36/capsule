/**
 * Runtime proof (PL-AUTH, AC-212 contact report reads): each Contacts report
 * (tppReports.contacts.run) opens only for a caller who may read its main
 * records, and data joined in from other records (client, venue, dish) shows
 * only when the caller may read those too. Removed records never show.
 * Synthetic workspace only.
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

const DENIED = /can't open this report/;
const tenantId = "tenant-contact-report-reads";
const day = Date.UTC(2026, 8, 20);

function run(actor: Actor, reportId: string, eventId?: string) {
  return actor.query(api.tppReports.contacts.run, {
    reportId,
    parameters: eventId ? { eventId } : {},
  });
}

/** Every text value in a report result, flattened for contains checks. */
async function text(actor: Actor, reportId: string, eventId?: string) {
  return JSON.stringify(await run(actor, reportId, eventId));
}

async function refused(actor: Actor, reportId: string, eventId?: string) {
  await expect(run(actor, reportId, eventId)).rejects.toThrow(DENIED);
}

async function seed(owner: Actor) {
  return owner.run(async (ctx) => {
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
      addressLine1: "1 Dock Road",
      phone: "555-0100",
      birthday: "1980-05-04",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
    });
    const goneClientId = await insert("clients", {
      clientType: "company",
      companyName: "Removed Co",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
      deletedAt: day,
    });
    const venueId = await insert("venues", {
      name: "Pier Hall",
      venueType: "banquet_hall",
      addressLine1: "9 Pier Street",
      capacity: 200,
      status: "active",
    });
    const eventId = await insert("events", {
      title: "Harbor Gala",
      eventType: "gala",
      stage: "planning",
      startsAt: day,
      clientId,
      venueId: String(venueId),
      primaryContactName: "Event Desk",
      expectedHeadcount: 120,
    });
    await insert("events", {
      title: "Old Party",
      eventType: "party",
      stage: "planning",
      startsAt: day,
      clientId: goneClientId,
    });
    const dishId = await insert("dishes", {
      name: "Seared Salmon",
      portionSize: 1,
      portionUnit: "portion",
      status: "active",
    });
    const goneDishId = await insert("dishes", {
      name: "Dropped Tart",
      portionSize: 1,
      portionUnit: "portion",
      status: "active",
    });
    await insert("eventDishes", {
      eventId,
      dishId,
      course: "main",
      quantityServings: 120,
    });
    await insert("eventDishes", {
      eventId,
      dishId: goneDishId,
      course: "dessert",
      quantityServings: 120,
      deletedAt: day,
    });
    await insert("invoices", {
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
      paymentTermsDays: 30,
    });
    await insert("proposals", {
      clientId,
      eventId,
      title: "Harbor Gala proposal",
      proposalNumber: "P-HARBOR",
      status: "sent",
      eventDate: day,
      guestCount: 120,
      terms: "Harbor proposal terms",
      subtotal: 4200,
      taxAmount: 0,
      discountAmount: 0,
      total: 4200,
    });
    await insert("contracts", {
      clientId,
      eventId,
      title: "Harbor Gala contract",
      contractNumber: "C-HARBOR",
      status: "sent",
    });
    return String(eventId);
  });
}

describe("runtime proof: Contacts reports follow each record's read policy (AC-212)", () => {
  it("opens each report only for roles that may read its records", async () => {
    const proof = harness();
    const as = (role: string) =>
      proof.asRole({ subject: "contact-report-" + role, role, tenantId });
    const owner = as("owner");
    const eventId = await seed(owner);

    // Control: the owner sees the client, the venue from the Venue record,
    // the live menu line (never the removed one) and every document.
    expect(await text(owner, "address-phone-list")).toContain("1 Dock Road");
    expect(await text(owner, "birthday-list")).toContain("Harbor Foods");
    const ownerMenu = await text(owner, "event-menu", eventId);
    expect(ownerMenu).toContain("Harbor Foods");
    expect(ownerMenu).toContain("Pier Hall");
    expect(ownerMenu).toContain("Seared Salmon");
    expect(ownerMenu).not.toContain("Dropped Tart");
    expect(await text(owner, "invoice-event", eventId)).toContain("INV-HARBOR");
    expect(await text(owner, "proposal-of-service", eventId)).toContain(
      "Harbor proposal terms",
    );
    expect(await text(owner, "contract-for-service", eventId)).toContain(
      "C-HARBOR",
    );
    const ownerOrders = await text(owner, "order-activity-list");
    expect(ownerOrders).toContain("Harbor Foods");
    // A removed client's name never shows, even to the owner.
    expect(ownerOrders).not.toContain("Removed Co");

    // Sales reads clients, proposals, contracts and dishes, not invoices or
    // venues: the venue record's name stays out of the event header.
    const sales = as("sales_staff");
    expect(await text(sales, "address-phone-list")).toContain("1 Dock Road");
    const salesProposal = await text(sales, "proposal-of-service", eventId);
    expect(salesProposal).toContain("Harbor Foods");
    expect(salesProposal).toContain("Seared Salmon");
    expect(salesProposal).not.toContain("Pier Hall");
    expect(await text(sales, "contract-for-service", eventId)).toContain(
      "C-HARBOR",
    );
    await refused(sales, "invoice-event", eventId);

    // Finance reads clients and invoices, not proposals, contracts or dishes.
    const finance = as("finance_staff");
    expect(await text(finance, "birthday-list")).toContain("Harbor Foods");
    expect(await text(finance, "invoice-event", eventId)).toContain(
      "INV-HARBOR",
    );
    await refused(finance, "proposal-of-service", eventId);
    await refused(finance, "contract-for-service", eventId);
    await refused(finance, "event-menu", eventId);

    // An event manager reads the event, venue, dishes and invoices, not the
    // client: the event's own contact shows in place of the client name.
    const eventManager = as("event_manager");
    await refused(eventManager, "address-phone-list");
    const managerMenu = await text(eventManager, "event-menu", eventId);
    expect(managerMenu).toContain("Pier Hall");
    expect(managerMenu).toContain("Event Desk");
    expect(managerMenu).not.toContain("Harbor Foods");
    const managerInvoice = await text(eventManager, "invoice-event", eventId);
    expect(managerInvoice).toContain("INV-HARBOR");
    expect(managerInvoice).not.toContain("Harbor Foods");
    const managerOrders = await text(eventManager, "order-activity-list");
    expect(managerOrders).toContain("Harbor Gala");
    expect(managerOrders).not.toContain("Harbor Foods");

    // A driver reads events only: no client, venue record, dish or document.
    const driver = as("driver");
    for (const reportId of [
      "address-phone-list",
      "birthday-list",
      "contact-activity",
    ])
      await refused(driver, reportId);
    for (const reportId of [
      "event-menu",
      "packing-slip",
      "invoice-event",
      "proposal-of-service",
      "contract-for-service",
    ])
      await refused(driver, reportId, eventId);
    const envelope = await text(driver, "contact-event-envelope", eventId);
    expect(envelope).toContain("Event Desk");
    expect(envelope).not.toContain("Harbor Foods");
    expect(envelope).not.toContain("1 Dock Road");
    expect(envelope).not.toContain("9 Pier Street");
    const driverOrders = await text(driver, "order-activity-list");
    expect(driverOrders).toContain("Harbor Gala");
    expect(driverOrders).not.toContain("Harbor Foods");
  });
});
