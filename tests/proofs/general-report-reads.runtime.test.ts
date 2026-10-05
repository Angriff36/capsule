/**
 * Runtime proof (PL-AUTH, AC-212 general report reads): each General report
 * (tppReports.general.run) opens only for a caller who may read its main
 * records, and data joined in from other records (client, venue, ingredient,
 * storage location, dish, menu, event) shows only when the caller may read
 * those too. Removed records never show. Synthetic workspace only.
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
const tenantId = "tenant-general-report-reads";
const day = Date.UTC(2026, 8, 20);

function run(actor: Actor, reportId: string, venueId?: string) {
  return actor.query(api.tppReports.general.run, {
    reportId,
    parameters: venueId ? { venueId } : {},
  });
}

/** Every text value in a report result, flattened for contains checks. */
async function text(actor: Actor, reportId: string, venueId?: string) {
  return JSON.stringify(await run(actor, reportId, venueId));
}

async function refused(actor: Actor, reportId: string) {
  await expect(run(actor, reportId)).rejects.toThrow(DENIED);
}

async function seed(owner: Actor) {
  return owner.run(async (ctx) => {
    const base = {
      tenantId,
      version: 1,
      createdAt: day,
      updatedAt: day,
    };
    const insert = (table: string, doc: Record<string, unknown>) =>
      ctx.db.insert(table as never, { ...base, ...doc } as never);
    const clientId = await insert("clients", {
      clientType: "company",
      companyName: "Harbor Foods",
      addressLine1: "1 Dock Road",
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
    await insert("clientOutreachTasks", {
      clientId,
      reason: "Call about spring menu",
      status: "open",
      openedAt: day,
    });
    await insert("clientOutreachTasks", {
      clientId: goneClientId,
      reason: "Old reminder",
      status: "open",
      openedAt: day,
    });
    await insert("leads", {
      leadType: "company",
      companyName: "Lakeside Lead",
      source: "web",
      estimatedValue: 900,
      stage: "new",
      probability: 10,
      capturedAt: day,
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
    });
    const goneEventId = await insert("events", {
      title: "Old Party",
      eventType: "party",
      stage: "planning",
      startsAt: day,
      deletedAt: day,
    });
    const closeoutMoney = {
      actualRevenue: 0,
      budgetedRevenue: 0,
      revenueVariance: 0,
      actualIngredientCost: 0,
      actualWasteCost: 0,
      actualLaborCost: 0,
      actualVendorCost: 0,
      budgetedCost: 0,
      totalActualCost: 0,
      costVariance: 0,
      grossProfit: 0,
      expectedHeadcount: 0,
      actualHeadcount: 0,
      status: "draft",
    };
    await insert("eventCloseouts", {
      ...closeoutMoney,
      eventId,
      performanceNotes: "Gala went well",
    });
    await insert("eventCloseouts", {
      ...closeoutMoney,
      eventId: goneEventId,
      performanceNotes: "Old party notes",
    });
    const saffronId = await insert("ingredients", {
      name: "Saffron Threads",
      unit: "gram",
      costPerUnit: 5,
      status: "active",
    });
    const pepperId = await insert("ingredients", {
      name: "Gone Pepper",
      unit: "gram",
      costPerUnit: 1,
      status: "active",
      deletedAt: day,
    });
    const coolerId = await insert("storageLocations", {
      name: "Walk-in Cooler",
      status: "active",
    });
    for (const ingredientId of [saffronId, pepperId])
      await insert("inventoryItems", {
        ingredientId,
        locationId: coolerId,
        quantityOnHand: 3,
        unit: "gram",
        parLevel: 0,
        reorderThreshold: 0,
        unitCost: 5,
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
      deletedAt: day,
    });
    const menuId = await insert("menus", {
      name: "Spring Package",
      isTemplate: false,
      basePrice: 0,
      pricePerPerson: 0,
      minGuests: 0,
      maxGuests: 0,
      status: "published",
    });
    for (const [index, id] of [dishId, goneDishId].entries()) {
      await insert("menuDishes", { menuId, dishId: id, sortOrder: index });
      await insert("eventDishes", {
        eventId,
        dishId: id,
        quantityServings: 40,
      });
    }
    await insert("people", {
      givenName: "Pat",
      familyName: "Cook",
      email: "pat@example.test",
      addressLine1: "7 Staff Lane",
      role: "kitchen_staff",
      employmentType: "full_time",
      status: "active",
    });
    await insert("vendors", {
      name: "Fresh Fish Co",
      paymentTermsDays: 30,
      status: "active",
    });
    return String(venueId);
  });
}

describe("runtime proof: General reports follow each record's read policy (AC-212)", () => {
  it("opens each report only for roles that may read its records", async () => {
    const proof = harness();
    const as = (role: string) =>
      proof.asRole({ subject: "general-report-" + role, role, tenantId });
    const owner = as("owner");
    const venueId = await seed(owner);

    // Control: the owner sees every report and joined name; removed clients,
    // ingredients, dishes and events never show.
    const ownerTasks = await text(owner, "contact-task-notes");
    expect(ownerTasks).toContain("Harbor Foods");
    expect(ownerTasks).not.toContain("Removed Co");
    expect(await text(owner, "contact-lead-opportunities")).toContain(
      "Lakeside Lead",
    );
    expect(await text(owner, "events-pending-final-confirmation")).toContain(
      "Pier Hall",
    );
    const ownerStock = await text(owner, "inventory-in-stock");
    expect(ownerStock).toContain("Saffron Threads");
    expect(ownerStock).toContain("Walk-in Cooler");
    expect(ownerStock).not.toContain("Gone Pepper");
    expect(await text(owner, "mailing-labels")).toContain("1 Dock Road");
    for (const reportId of [
      "menu-item-listing-report",
      "menu-item-packages",
      "menu-item-popularity",
    ]) {
      const menu = await text(owner, reportId);
      expect(menu).toContain("Seared Salmon");
      expect(menu).not.toContain("Dropped Tart");
    }
    const ownerNotes = await text(owner, "post-event-notes");
    expect(ownerNotes).toContain("Gala went well");
    expect(ownerNotes).not.toContain("Old party notes");
    expect(await text(owner, "staff-address-phone-list")).toContain(
      "7 Staff Lane",
    );
    expect(await text(owner, "vendor-phone-list")).toContain("Fresh Fish Co");
    expect(await text(owner, "venue-listing")).toContain("Pier Hall");
    expect(await text(owner, "venue-detail", venueId)).toContain(
      "9 Pier Street",
    );

    // Sales reads follow-ups, leads, clients, dishes and menus - not stock,
    // closeouts, vendors or venues (the Venue record never fills the event).
    const sales = as("sales_staff");
    expect(await text(sales, "contact-task-notes")).toContain("Harbor Foods");
    expect(await text(sales, "contact-lead-opportunities")).toContain(
      "Lakeside Lead",
    );
    expect(await text(sales, "mailing-labels")).toContain("1 Dock Road");
    expect(await text(sales, "menu-item-packages")).toContain("Spring Package");
    const salesPending = await text(sales, "events-pending-final-confirmation");
    expect(salesPending).toContain("Harbor Gala");
    expect(salesPending).not.toContain("Pier Hall");
    for (const reportId of [
      "inventory-in-stock",
      "post-event-notes",
      "vendor-phone-list",
      "venue-listing",
    ])
      await refused(sales, reportId);

    // Finance reads clients and closeouts, not follow-ups, leads or dishes.
    const finance = as("finance_staff");
    expect(await text(finance, "mailing-labels")).toContain("1 Dock Road");
    expect(await text(finance, "post-event-notes")).toContain("Gala went well");
    for (const reportId of [
      "contact-task-notes",
      "contact-lead-opportunities",
      "menu-item-listing-report",
      "inventory-in-stock",
    ])
      await refused(finance, reportId);

    // Stock staff read stock, storage locations and ingredient names.
    const stock = as("inventory_staff");
    const stockRows = await text(stock, "inventory-in-stock");
    expect(stockRows).toContain("Walk-in Cooler");
    expect(stockRows).toContain("Saffron Threads");
    await refused(stock, "mailing-labels");
    await refused(stock, "vendor-phone-list");

    // Procurement staff read vendors.
    expect(await text(as("procurement_staff"), "vendor-phone-list")).toContain(
      "Fresh Fish Co",
    );

    // An event manager reads closeouts, venues and (as a manager) stock
    // items and ingredient names, not clients or storage locations.
    const eventManager = as("event_manager");
    expect(await text(eventManager, "post-event-notes")).toContain(
      "Gala went well",
    );
    expect(await text(eventManager, "venue-listing")).toContain("Pier Hall");
    expect(
      await text(eventManager, "events-pending-final-confirmation"),
    ).toContain("Pier Hall");
    const managerStock = await text(eventManager, "inventory-in-stock");
    expect(managerStock).toContain("Saffron Threads");
    expect(managerStock).not.toContain("Walk-in Cooler");
    await refused(eventManager, "mailing-labels");
    await refused(eventManager, "contact-task-notes");

    // A driver reads events and people only.
    const driver = as("driver");
    expect(await text(driver, "staff-address-phone-list")).toContain(
      "7 Staff Lane",
    );
    const driverPending = await text(
      driver,
      "events-pending-final-confirmation",
    );
    expect(driverPending).toContain("Harbor Gala");
    expect(driverPending).not.toContain("Pier Hall");
    for (const reportId of [
      "contact-task-notes",
      "contact-lead-opportunities",
      "inventory-in-stock",
      "mailing-labels",
      "menu-item-listing-report",
      "menu-item-packages",
      "menu-item-popularity",
      "post-event-notes",
      "vendor-phone-list",
      "venue-listing",
      "venue-detail",
    ])
      await refused(driver, reportId);
  });
});
