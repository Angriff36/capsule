import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";
import { buildWorkbook } from "../../src/lib/eventPacket/buildWorkbook";

const api = anyApi.lib.eventPacket.commands;
const T = "tenant-a";
const base = { tenantId: T, version: 1, deletedAt: null };

/** One event with every record the eight packet parts read. */
async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "trusted-manager",
    org_id: T,
    role: "admin",
  });
  const ids = await t.run(async (ctx) => {
    const clientId = await ctx.db.insert("clients", {
      ...base,
      clientType: "company",
      companyName: "Harbor Law",
      taxExempt: false,
      paymentTermsDays: 30,
      status: "active",
    });
    const serviceStyleId = await ctx.db.insert("serviceStyles", {
      ...base,
      name: "Full Service",
      code: "full",
      sortOrder: 0,
      status: "active",
    });
    const venueId = await ctx.db.insert("venues", {
      ...base,
      name: "Harbor Hall",
      venueType: "banquet_hall",
      capacity: 300,
      status: "active",
      addressLine1: "12 Pier Road",
      loadInInstructions: "Freight door on the east side",
    });
    const eventId = await ctx.db.insert("events", {
      ...base,
      clientId,
      serviceStyleId,
      venueId,
      eventNumber: "6901",
      title: "Harbor dinner",
      eventType: "Dinner",
      startsAt: Date.parse("2026-10-02T22:00:00Z"),
      endsAt: Date.parse("2026-10-03T02:00:00Z"),
      expectedHeadcount: 120,
      budgetAmount: 0,
      quotedPrice: 0,
      stage: "planning",
      barService: "Full bar, two bartenders",
    });
    // Lexical order would be Apple, Brisket, Chowder; service order is not.
    for (const [name, sortOrder] of [
      ["Chowder", 1],
      ["Brisket", 2],
      ["Apple tart", 3],
    ] as const) {
      const dishId = await ctx.db.insert("dishes", {
        ...base,
        name,
        portionSize: 1,
        portionUnit: "each",
        status: "active",
      });
      await ctx.db.insert("eventDishes", {
        ...base,
        eventId,
        dishId,
        quantityServings: 120,
        sortOrder,
      });
    }
    const packListId = await ctx.db.insert("packLists", {
      ...base,
      eventId,
      name: "Event packing",
      status: "draft",
    });
    const packItem = await ctx.db.insert("packListItems", {
      ...base,
      packListId,
      description: "Chafing dish",
      category: "serving_vessel",
      requiredQuantity: 6,
      packedQuantity: 0,
      unit: "each",
      status: "listed",
    });
    await ctx.db.insert("packListItems", {
      ...base,
      packListId,
      description: "Round linen",
      category: "linen",
      ownership: "rented",
      requiredQuantity: 12,
      packedQuantity: 0,
      unit: "each",
      status: "listed",
      binNumber: 4,
    });
    const person = (givenName: string, phone: string) =>
      ctx.db.insert("people", {
        ...base,
        givenName,
        familyName: "Crew",
        email: `${givenName}@example.test`,
        phone,
        role: "event_staff",
        employmentType: "part_time",
        status: "active",
      });
    const lead = await person("Lena", "555-0101");
    const server = await person("Sam", "555-0199");
    const driver = await person("Dev", "555-0123");
    for (const [personId, role, hour] of [
      [lead, "Event lead", 20],
      [server, "Server", 21],
      [driver, "Server", 20],
    ] as const)
      await ctx.db.insert("eventAssignments", {
        ...base,
        eventId,
        personId,
        role,
        startsAt: Date.parse(`2026-10-02T${hour}:00:00Z`),
        status: "assigned",
      });
    const vehicleId = await ctx.db.insert("vehicles", {
      ...base,
      make: "Ford",
      model: "Transit",
      registration: "VAN17",
      ownership: "owned",
      payloadCapacityKg: 1200,
      operationalStatus: "available",
    });
    await ctx.db.insert("eventVehicleAssignments", {
      ...base,
      eventId,
      vehicleId,
      driverId: driver,
      loadingZone: "Dock B",
    });
    const equipmentId = await ctx.db.insert("equipments", {
      ...base,
      name: "Lantern centerpiece",
      assetTag: "DEC-1",
      category: "Decor",
      ownership: "owned",
      quantity: 20,
      purchaseValue: 0,
      condition: "good",
      status: "active",
    });
    await ctx.db.insert("equipmentReservations", {
      ...base,
      equipmentId,
      eventId,
      startsAt: Date.parse("2026-10-02T18:00:00Z"),
      endsAt: Date.parse("2026-10-03T04:00:00Z"),
      quantity: 12,
      status: "reserved",
    });
    const vendorId = await ctx.db.insert("vendors", {
      ...base,
      name: "Party Rents",
      paymentTermsDays: 30,
      status: "active",
    });
    await ctx.db.insert("rentalOrderLines", {
      ...base,
      eventId,
      vendorId,
      description: "Farm tables",
      quantity: 10,
      countUnit: "each",
      vendorCost: 0,
      pickupAt: Date.parse("2026-10-03T15:00:00Z"),
      status: "confirmed",
    });
    await ctx.db.insert("rentalOrderLines", {
      ...base,
      eventId,
      vendorId,
      description: "Cocktail rounds",
      quantity: 6,
      countUnit: "each",
      vendorCost: 0,
      status: "requested",
    });
    await ctx.db.insert("eventLayoutSections", {
      ...base,
      eventId,
      type: "Buffet line",
      instructions: "Two tables along the north wall",
      sortOrder: 1,
    });
    return { eventId, packItem };
  });
  return { t, manager, ...ids };
}

describe("event packet parts from Capsule's own records", () => {
  it("prints all eight parts in binder order from native records, with no report upload", async () => {
    const { manager, eventId } = await setup();
    const p = await manager.query(api.getPacket, { eventId });
    const native = p.snapshot.native;
    expect(native.menu.map((d: { name: string }) => d.name)).toEqual([
      "Chowder",
      "Brisket",
      "Apple tart",
    ]);
    const w = buildWorkbook(p.snapshot, { finalLock: p.finalLock.lines });
    const ids = w.sections.map((s) => s.id);
    const at = (id: string) => ids.indexOf(id);
    // Worksheet, menu, pack by type, pack by category, forms, staff, pull
    // sheet, route - in that order.
    const order = [
      "brief",
      "menu",
      "packlist-item",
      "packlist-category",
      "forms",
      "staffing",
      "equipment",
      "venue",
    ];
    for (const id of order) expect(at(id)).toBeGreaterThanOrEqual(0);
    expect(order.map(at)).toEqual([...order.map(at)].sort((a, b) => a - b));
    expect(at("field.task")).toBeGreaterThan(at("forms"));
    expect(at("field.task")).toBeLessThan(at("staffing"));
    const part = (id: string) =>
      w.sections
        .find((s) => s.id === id)!
        .blocks.map((b) => b.text)
        .join("\n");
    const menu = part("menu");
    expect(menu.indexOf("Chowder")).toBeLessThan(menu.indexOf("Brisket"));
    expect(menu.indexOf("Brisket")).toBeLessThan(menu.indexOf("Apple tart"));
    expect(part("brief")).toContain("Red binder");
    expect(part("brief")).toContain("blue half-inch binder for the bar");
    expect(part("brief")).toContain("Event 6901 goes on the spine");
    expect(part("packlist-item")).toContain("REF");
    expect(part("packlist-item")).toContain("Rentals");
    expect(part("packlist-category")).toContain("Serving vessel");
    expect(part("packlist-category")).toContain("[ ] Chafing dish - 6 each");
    // A line in a numbered bin prints its bin (Perfect Packing memo).
    expect(part("packlist-category")).toContain(
      "Round linen - 12 each - bin 4",
    );
    const staff = part("staffing");
    expect(staff).toContain("Lena Crew - Event lead");
    expect(staff).toContain("555-0101");
    expect(staff).toContain("555-0123");
    expect(staff).not.toContain("555-0199");
    expect(staff).not.toContain("native-");
    const pull = part("equipment");
    expect(pull).toContain("Our decor");
    expect(pull).toContain("Lantern centerpiece - 12 each | back: Our crew by");
    expect(pull).toContain(
      "Farm tables - 10 each | back: Party Rents picks up by",
    );
    expect(pull).toContain("Nobody is named to bring back: Cocktail rounds");
    const route = part("venue");
    expect(route).toContain("12 Pier Road");
    expect(route).toContain("https://www.google.com/maps/search/?api=1&query=");
    expect(route).toContain("Load-in: Freight door on the east side");
    expect(route).toContain(
      "Ford Transit VAN17 | driver Dev Crew | load at Dock B",
    );
    expect(route).toContain(
      "Setup: Buffet line - Two tables along the north wall",
    );
    // Capsule's own pack list and crew answer the old report checks.
    for (const key of [
      "check.report.packlist_item_type",
      "check.report.packlist_category",
      "check.report.nowsta_event_timesheet",
    ])
      expect(
        p.snapshot.issues.find((i: { key: string }) => i.key === key).status,
      ).toBe("resolved");
  });

  it("a print names the packet parts a later change made out of date", async () => {
    const { t, manager, eventId, packItem } = await setup();
    const p = await manager.query(api.getPacket, { eventId });
    const doc = await PDFDocument.create();
    doc.addPage();
    const pdf = await manager.action(api.uploadPacketFile, {
      eventId,
      bytes: (await doc.save()).buffer,
      name: "workbook.pdf",
      mimeType: "application/pdf",
      purpose: "pdf",
      inputFingerprint: p.currentFingerprint,
      finalLockFingerprint: p.finalLockFingerprint,
    });
    const snap = await manager.action(api.uploadPacketFile, {
      eventId,
      bytes: new TextEncoder().encode(
        JSON.stringify({ ...p.snapshot, finalLock: p.finalLock }),
      ).buffer,
      name: "snapshot.json",
      mimeType: "application/json",
      purpose: "snapshot",
    });
    const printed = await manager.mutation(api.recordPacketRevision, {
      eventId,
      inputFingerprint: p.currentFingerprint,
      finalLockFingerprint: p.finalLockFingerprint,
      pdfStorageId: pdf.storageId,
      snapshotStorageId: snap.storageId,
    });
    const fresh = await manager.query(api.getPacket, { eventId });
    expect(fresh.latestRevision.stale).toBe(false);
    expect(fresh.latestRevision.staleSections).toEqual([]);
    await t.run((ctx) => ctx.db.patch(packItem, { requiredQuantity: 8 }));
    const after = await manager.query(api.getPacket, { eventId });
    expect(after.latestRevision.id).toBe(printed.id);
    expect(after.latestRevision.stale).toBe(true);
    expect(after.latestRevision.staleSections).toEqual(
      expect.arrayContaining([
        "Pack list by item type",
        "Pack list by warehouse category",
      ]),
    );
    for (const untouched of ["Event menu", "Staff sheet", "Event worksheet"])
      expect(after.latestRevision.staleSections).not.toContain(untouched);
    // The stored print is never changed; the snapshot file still holds the old count.
    const rows = await t.run((ctx) =>
      ctx.db.query("eventPacketRevisions").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].snapshotFingerprint).toBe(p.currentFingerprint);
  });
});
