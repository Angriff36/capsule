/**
 * Runtime proof (PL-AUTH, AC-212 event report reads): each Event report
 * (tppReports.events.run) opens only for a caller who may read its main
 * records, and data joined in from other records (venue, dish, person,
 * ingredient, vendor, equipment) shows only when the caller may read those
 * too. Removed records never show. Synthetic workspace only.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { TPP_EVENT_REPORTS } from "../../src/features/reports/tpp/catalog.event";

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
const tenantId = "tenant-event-report-reads";
const day = Date.UTC(2026, 8, 20);

let eventId = "";

function run(actor: Actor, reportId: string) {
  return actor.query(api.tppReports.events.run, {
    reportId,
    parameters: { eventId },
  });
}

/** Every text value in a report result, flattened for contains checks. */
async function text(actor: Actor, reportId: string) {
  return JSON.stringify(await run(actor, reportId));
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
    const event = await insert("events", {
      title: "Harbor Gala",
      eventType: "gala",
      stage: "planning",
      startsAt: day,
      clientId,
      venueId: String(venueId),
    });
    await insert("events", {
      title: "Old Party",
      eventType: "party",
      stage: "planning",
      startsAt: day,
      deletedAt: day,
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
    const eventDishId = await insert("eventDishes", {
      eventId: event,
      dishId,
      quantityServings: 40,
    });
    await insert("eventDishes", {
      eventId: event,
      dishId: goneDishId,
      quantityServings: 40,
    });
    await insert("prepTasks", {
      eventDishId,
      eventId: event,
      name: "Sear salmon",
      category: "hot",
      taskType: "prep",
      isGenerated: false,
      quantity: 40,
      unit: "portion",
      status: "pending",
    });
    const packListId = await insert("packLists", {
      eventId: event,
      name: "Main load",
      status: "draft",
    });
    await insert("packListItems", {
      packListId,
      description: "Salmon crate",
      dishId,
      requiredQuantity: 2,
      packedQuantity: 0,
      unit: "each",
      status: "listed",
    });
    await insert("deliveries", {
      packListId,
      eventId: event,
      destination: "1 Dock Road",
      status: "scheduled",
    });
    await insert("invoices", {
      clientId,
      eventId: event,
      invoiceNumber: "INV-7",
      subtotal: 100,
      taxAmount: 0,
      discountAmount: 0,
      total: 100,
      amountPaid: 0,
      amountDue: 100,
      paymentTermsDays: 30,
      status: "sent",
    });
    const person = {
      email: "crew@example.test",
      role: "staff",
      employmentType: "full_time",
      status: "active",
    };
    const patId = await insert("people", {
      ...person,
      givenName: "Pat",
      familyName: "Cook",
    });
    const goneId = await insert("people", {
      ...person,
      givenName: "Gone",
      familyName: "Worker",
      deletedAt: day,
    });
    for (const personId of [patId, goneId])
      await insert("shifts", {
        personId,
        eventId: event,
        startsAt: day,
        endsAt: day + 3_600_000,
        status: "scheduled",
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
    const vendorId = await insert("vendors", {
      name: "Fresh Fish Co",
      paymentTermsDays: 30,
      status: "active",
    });
    const goneVendorId = await insert("vendors", {
      name: "Gone Vendor",
      paymentTermsDays: 30,
      status: "active",
      deletedAt: day,
    });
    // One live ingredient per by-category order list.
    const categoryIds = [];
    for (const [name, category] of [
      ["Sparkling Cider", "beverage"],
      ["Table Flowers", "floral"],
      ["Paper Napkins", "disposable supply"],
    ])
      categoryIds.push(
        await insert("ingredients", {
          name,
          category,
          unit: "each",
          costPerUnit: 1,
          status: "active",
        }),
      );
    for (const [ingredientId, preferredVendorId] of [
      [saffronId, vendorId],
      [pepperId, goneVendorId],
      ...categoryIds.map((id) => [id, vendorId]),
    ]) {
      const ingredientDemandId = await insert("ingredientDemands", {
        eventId: event,
        ingredientId,
        requiredQuantity: 3,
        unit: "gram",
        status: "calculated",
      });
      await insert("purchaseNeeds", {
        eventId: event,
        ingredientDemandId,
        ingredientId,
        preferredVendorId,
        requiredQuantity: 3,
        unit: "gram",
        status: "open",
      });
    }
    const equipment = {
      category: "serving",
      ownership: "owned",
      quantity: 4,
      purchaseValue: 0,
      condition: "good",
      status: "active",
    };
    const chafingId = await insert("equipments", {
      ...equipment,
      name: "Chafing Dish",
      assetTag: "EQ-1",
    });
    const tentId = await insert("equipments", {
      ...equipment,
      name: "Old Tent",
      assetTag: "EQ-2",
      deletedAt: day,
    });
    const archId = await insert("equipments", {
      ...equipment,
      ownership: "rented",
      name: "Rented Arch",
      assetTag: "EQ-3",
    });
    await insert("eventTimelineActivities", {
      eventId: event,
      name: "Load the van",
      startsAt: day,
    });
    for (const equipmentId of [chafingId, tentId, archId])
      await insert("equipmentReservations", {
        equipmentId,
        eventId: event,
        startsAt: day,
        endsAt: day,
        quantity: 2,
        status: "reserved",
      });
    return String(event);
  });
}

describe("runtime proof: Event reports follow each record's read policy (AC-212)", () => {
  it("opens each report only for roles that may read its records", async () => {
    const proof = harness();
    const as = (role: string) =>
      proof.asRole({ subject: "event-report-" + role, role, tenantId });
    const owner = as("owner");
    eventId = await seed(owner);

    // Control: the owner sees every report and joined name; removed events,
    // dishes, people, ingredients, vendors and equipment never show.
    const ownerEvents = await text(owner, "event-list");
    expect(ownerEvents).toContain("Harbor Gala");
    expect(ownerEvents).toContain("Pier Hall");
    expect(ownerEvents).not.toContain("Old Party");
    expect(await text(owner, "event-delivery-addresses")).toContain(
      "1 Dock Road",
    );
    expect(await text(owner, "invoice-number-history")).toContain("INV-7");
    const ownerShifts = await text(owner, "staff-schedules");
    expect(ownerShifts).toContain("Pat Cook");
    expect(ownerShifts).not.toContain("Gone Worker");
    const ownerOrders = await text(owner, "order-list");
    expect(ownerOrders).toContain("Saffron Threads");
    expect(ownerOrders).toContain("Fresh Fish Co");
    expect(ownerOrders).not.toContain("Gone Pepper");
    expect(ownerOrders).not.toContain("Gone Vendor");
    const ownerShopping = await text(owner, "shopping-list");
    expect(ownerShopping).toContain("Saffron Threads");
    expect(ownerShopping).not.toContain("Gone Pepper");
    const ownerEquipment = await text(owner, "equipment-summary");
    expect(ownerEquipment).toContain("Chafing Dish");
    expect(ownerEquipment).not.toContain("Old Tent");
    const ownerBeo = await text(owner, "event-beo");
    expect(ownerBeo).toContain("Seared Salmon");
    expect(ownerBeo).not.toContain("Dropped Tart");
    expect(ownerBeo).toContain("Pat Cook");
    expect(ownerBeo).toContain("Chafing Dish");
    expect(ownerBeo).not.toContain("Old Tent");
    expect(await text(owner, "pack-list")).toContain("Seared Salmon");
    expect(await text(owner, "production-summary")).toContain("Sear salmon");
    expect(await text(owner, "menu-item-recipes")).toContain("Seared Salmon");

    // A driver reads events, deliveries, staffing, equipment and pack lists,
    // not venues, dishes, prep, stock, orders or invoices.
    const driver = as("driver");
    const driverEvents = await text(driver, "event-list");
    expect(driverEvents).toContain("Harbor Gala");
    expect(driverEvents).not.toContain("Pier Hall");
    expect(await text(driver, "event-delivery-addresses")).toContain(
      "1 Dock Road",
    );
    expect(await text(driver, "staff-schedules")).toContain("Pat Cook");
    const driverBeo = await text(driver, "event-beo");
    expect(driverBeo).toContain("Harbor Gala");
    expect(driverBeo).not.toContain("Seared Salmon");
    expect(driverBeo).not.toContain("Pier Hall");
    expect(driverBeo).toContain("Chafing Dish");
    const driverPack = await text(driver, "pack-list");
    expect(driverPack).toContain("Salmon crate");
    expect(driverPack).not.toContain("Seared Salmon");
    await run(driver, "contact-worksheet-blank");
    for (const reportId of [
      "invoice-number-history",
      "order-list",
      "shopping-list",
      "production-summary",
      "event-menu-item-production",
      "event-menu-item-labels",
      "heating-serving-event-menu",
      "menu-item-recipes",
    ])
      await refused(driver, reportId);

    // Kitchen staff read menus, prep and recipes, not deliveries, invoices,
    // orders or equipment.
    const kitchen = as("kitchen_staff");
    expect(await text(kitchen, "production-summary")).toContain("Sear salmon");
    expect(await text(kitchen, "event-menu-item-labels")).toContain(
      "Seared Salmon",
    );
    expect(await text(kitchen, "menu-item-recipes")).toContain("Seared Salmon");
    for (const reportId of [
      "event-delivery-addresses",
      "invoice-number-history",
      "order-list",
      "equipment-summary",
      "rental-order-list-by-vendor",
    ])
      await refused(kitchen, reportId);

    // Sales staff read menu labels but not recipes or prep.
    const sales = as("sales_staff");
    expect(await text(sales, "menu-item-table-tents")).toContain(
      "Seared Salmon",
    );
    await refused(sales, "menu-item-recipes");
    await refused(sales, "production-summary");

    // Finance staff read invoices.
    const finance = as("finance_staff");
    expect(await text(finance, "invoice-number-history")).toContain("INV-7");
    await refused(finance, "order-list");

    // Stock staff read purchase needs, demand and ingredient names but not
    // vendor names; procurement staff see the vendor too.
    const stock = as("inventory_staff");
    const stockOrders = await text(stock, "order-list");
    expect(stockOrders).toContain("Saffron Threads");
    expect(stockOrders).not.toContain("Gone Pepper");
    expect(stockOrders).not.toContain("Fresh Fish Co");
    expect(await text(stock, "shopping-list")).toContain("Saffron Threads");
    const procurementOrders = await text(as("procurement_staff"), "order-list");
    expect(procurementOrders).toContain("Fresh Fish Co");
    expect(procurementOrders).not.toContain("Gone Vendor");
    expect(procurementOrders).toContain("Saffron Threads");

    // An event manager reads reservations (not the equipment itself) and
    // venues.
    const eventManager = as("event_manager");
    expect(await text(eventManager, "event-list")).toContain("Pier Hall");
    const managerEquipment = await text(eventManager, "equipment-summary");
    expect(managerEquipment).not.toContain("Chafing Dish");
    await refused(eventManager, "rental-order-list-by-vendor");

    // Every Event report runs for the owner and for one allowed non-owner
    // role that sees its seeded data; where a staff role may not read the
    // report's records, that role is refused.
    const allowed: Record<string, [string, string, string?]> = {
      "contact-worksheet-blank": ["driver", "Company"],
      "event-changes": ["driver", "Harbor Gala"],
      "event-list": ["driver", "Harbor Gala"],
      "event-schedule": ["kitchen_staff", "Harbor Gala"],
      "event-booking": ["sales_staff", "Harbor Gala"],
      "event-delivery-addresses": [
        "logistics_staff",
        "1 Dock Road",
        "kitchen_staff",
      ],
      "event-tasks-notes": ["event_staff", "Load the van"],
      "invoice-number-history": ["finance_staff", "INV-7", "driver"],
      "staff-schedules": ["workforce_staff", "Pat Cook"],
      "master-food-production-worksheet": [
        "kitchen_staff",
        "Seared Salmon",
        "driver",
      ],
      "event-menu-item-production": [
        "kitchen_manager",
        "Seared Salmon",
        "sales_staff",
      ],
      "beverage-order-list-by-vendor": [
        "inventory_staff",
        "Sparkling Cider",
        "kitchen_staff",
      ],
      "miscellaneous-order-list-by-vendor": [
        "procurement_staff",
        "Table Flowers",
        "sales_staff",
      ],
      "other-inventory-order-list-by-vendor": [
        "inventory_manager",
        "Paper Napkins",
        "driver",
      ],
      "order-list": ["inventory_staff", "Saffron Threads", "finance_staff"],
      "rental-order-list-by-vendor": [
        "logistics_staff",
        "Rented Arch",
        "kitchen_staff",
      ],
      "event-beo": ["event_staff", "Harbor Gala"],
      "event-timeline": ["event_staff", "Load the van"],
      "event-worksheet": ["workforce_staff", "Pat Cook"],
      "heating-serving-event-menu": ["sales_staff", "Seared Salmon", "driver"],
      "event-menu-item-labels": ["kitchen_staff", "Seared Salmon", "driver"],
      "heating-serving-labels": ["sales_manager", "Seared Salmon", "driver"],
      "menu-item-table-tents": ["sales_staff", "Seared Salmon", "driver"],
      "production-summary": ["kitchen_staff", "Sear salmon", "sales_staff"],
      "kitchen-labor": ["kitchen_lead", "Sear salmon", "driver"],
      "equipment-summary": ["inventory_staff", "Chafing Dish", "kitchen_staff"],
      "pack-list": ["driver", "Salmon crate"],
      "shopping-list": ["procurement_staff", "Saffron Threads", "driver"],
      "menu-item-recipes": ["kitchen_staff", "Seared Salmon", "sales_staff"],
    };
    expect(Object.keys(allowed).sort()).toEqual(
      TPP_EVENT_REPORTS.map((report) => report.id).sort(),
    );
    for (const [reportId, [role, marker, refusedRole]] of Object.entries(
      allowed,
    )) {
      expect(await text(owner, reportId), reportId).toContain(marker);
      expect(
        await text(as(role), reportId),
        `${reportId} as ${role}`,
      ).toContain(marker);
      if (refusedRole) await refused(as(refusedRole), reportId);
    }
  });
});
