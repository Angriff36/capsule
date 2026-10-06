// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { digestHex } from "../src/lib/tppAccountFile";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import schema from "../convex/schema";
import { importTppRecord, tppDate } from "../convex/lib/tppAccountNative";
import {
  analyzePackagePatterns,
  type InventoryLine,
} from "../src/lib/tppPackagePatterns";
import { planPackLines } from "../src/lib/packRules";

beforeAll(() =>
  vi.stubEnv("CONVEX_FIELD_ENCRYPTION_KEY", "local-test-only-not-a-secret"),
);
afterAll(() => vi.unstubAllEnvs());

it("keeps historical booked and cancelled opportunities closed instead of flooding the new-lead pipeline", async () => {
  const { t, put } = await fixture();
  for (const [id, name] of [
    [1, "Booked"],
    [2, "Cancelled"],
    [3, "Pending"],
  ] as const) {
    await put("opportunities", {
      id,
      eventId: -1,
      primaryContact: { id, firstName: "Test" },
      status: { name },
    });
  }
  const leads = await t.run((ctx) => ctx.db.query("leads").collect());
  expect(
    leads.filter((x) => x.closedAt == null).map((x) => x.sourceStage),
  ).toEqual(["Pending"]);
  expect(leads.find((x) => x.sourceStage === "Booked")?.probability).toBe(100);
  expect(leads.find((x) => x.sourceStage === "Cancelled")?.closedAt).toBeTypeOf(
    "number",
  );
});

it("keeps email bodies when descriptions are empty and omits empty history rows", async () => {
  const { t, put } = await fixture();
  await put("contacts", { id: 1, firstName: "Test" });
  await put("contactNotes", {
    id: 2,
    cli_ClientSak: 1,
    cli_Description: "",
    cliext_EmailBody: "Please use the loading dock.",
    cli_LogItemDate: "2026-07-01T12:00:00",
  });
  expect(
    (await put("contactNotes", { id: 3, cli_ClientSak: 1, note: "" })).kind,
  ).toBe("preserved");
  const history = await t.run((ctx) =>
    ctx.db.query("clientCommunications").collect(),
  );
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    summary: "Please use the loading dock.",
    medium: "email",
    occurredAt: Date.parse("2026-07-01T18:00:00Z"),
  });
});

async function fixture() {
  const t = convexTest(schema, {
    "../convex/_generated/api.js": () => import("../convex/_generated/api.js"),
    "../convex/tppUpload.ts": () => import("../convex/tppUpload"),
    "../convex/tppUploadFiles.ts": () => import("../convex/tppUploadFiles"),
  });
  const jobId = await t.run((ctx) =>
    ctx.db.insert("tppUploads", {
      tenantId: "mapping-test",
      sourceAccount: "source-account",
      fingerprint: "fixture",
      fileName: "fixture.json",
      fileSize: 1,
      metadata: '{"account":{},"manifest":{"counts":{}}}',
      status: "uploading",
      nextPart: 0,
      bytesReceived: 0,
      counts: "{}",
      actorId: "tester",
      timeZone: "America/Denver",
      version: 1,
      deletedAt: null,
    }),
  );
  const job = (await t.run((ctx) => ctx.db.get(jobId)))!;
  const put = (collection: string, row: Record<string, any>) =>
    t.run((ctx) => importTppRecord(ctx, job, collection, row, String(row.id)));
  return { t, put, jobId };
}

it("automatically imports inferred packages and packing defaults, resumes without duplication, and never expands recorded historical equipment", async () => {
  const { t, put, jobId } = await fixture();
  await put("inventoryItems", {
    id: 10,
    name: "Portable bar",
    classification: "E",
  });
  const events = Array.from({ length: 20 }, (_, id) => ({
    id,
    date: "2025-06-01",
    guestCount: 100,
  }));
  const lines: InventoryLine[] = [];
  for (let i = 0; i < 4; i++) {
    lines.push(
      {
        id: `p${i}`,
        event: i,
        quantity: i + 1,
        inventoryItem: { id: 20, name: "Bar package", classification: "EP" },
      },
      {
        id: `e${i}`,
        event: i,
        quantity: 2 * (i + 1),
        inventoryItem: { id: 10, name: "Portable bar", classification: "E" },
      },
    );
  }
  const pkg = analyzePackagePatterns(events, lines, "2026-09-28").packages[0];
  const owner = t.withIdentity({
    subject: "tester",
    tenantId: "mapping-test",
    role: "admin",
  });
  const blob = new Blob([JSON.stringify([pkg])], { type: "application/json" });
  const storageId = await t.run((ctx) => ctx.storage.store(blob));
  const batch = {
    id: jobId,
    sequence: 0,
    collection: "__packages_v1",
    storageId,
    byteSize: blob.size,
    checksum: await digestHex(await blob.arrayBuffer()),
  };
  const commit = makeFunctionReference<"action">("tppUploadFiles:commit");
  const result = await owner.action(commit, batch);
  expect(JSON.parse(result.counts).__packages_v1).toMatchObject({
    imported: 1,
    needs_mapping: 0,
  });
  expect((await owner.action(commit, batch)).nextPart).toBe(1);
  expect((await put("__packages_v1", pkg)).kind).toBe("existing");
  await put("events", {
    id: 1,
    name: "Old event",
    date: "2025-06-01",
    guestCount: 100,
    statusModel: { name: "Confirmed" },
  });
  await put("eventInventoryItems", {
    id: 100,
    event: 1,
    quantity: 2,
    inventoryItem: { id: 20, name: "Bar package", classification: "EP" },
  });
  const records = await t.run(async (ctx) => ({
    dishes: await ctx.db.query("dishes").collect(),
    rules: await ctx.db.query("packRules").collect(),
    lines: await ctx.db.query("eventDishes").collect(),
  }));
  expect(records.dishes).toHaveLength(1);
  expect(records.dishes[0]).toMatchObject({
    kind: "package",
    name: "Bar package",
  });
  expect(records.rules).toHaveLength(1);
  expect(records.rules[0]).toMatchObject({
    quantityPerUnit: 2,
    perUnits: 1,
    scaleBy: "servings",
    aggregateDishQuantity: true,
  });
  expect(records.lines[0]).toMatchObject({
    packingAlreadyRecorded: true,
    followsEventHeadcount: false,
    quantityServings: 2,
  });
  const input = {
    event: { eventId: "event", headcount: 100, facts: {} },
    rentals: [],
    rules: records.rules.map((r) => ({ ...r, id: r._id })),
    dishes: records.lines.map((d) => ({
      eventDishId: d._id,
      dishId: d.dishId,
      dishName: d.dishName!,
      servings: d.quantityServings,
      packingAlreadyRecorded: d.packingAlreadyRecorded,
    })),
  };
  expect(planPackLines(input)).toEqual([]);
  expect(
    planPackLines({
      ...input,
      dishes: [{ ...input.dishes[0], packingAlreadyRecorded: false }],
    }),
  ).toMatchObject([{ description: "Portable bar", quantity: 4 }]);
  // Two selections of the same package aggregate before scaling.
  expect(
    planPackLines({
      ...input,
      dishes: [
        { ...input.dishes[0], packingAlreadyRecorded: false },
        {
          ...input.dishes[0],
          eventDishId: "new",
          packingAlreadyRecorded: false,
        },
      ],
    }),
  ).toMatchObject([{ quantity: 8 }]);
});

it("groups contacts by source company identity and replays without extra accounts or people", async () => {
  const { t, put } = await fixture();
  const a = {
    id: 1,
    businessId: 9,
    businessName: "Test Company",
    firstName: "Alex",
    lastName: "One",
    email: "alex@example.invalid",
    addedDate: "9/1/2026 2:00:00 PM",
  };
  const b = { ...a, id: 2, firstName: "Sam", email: "sam@example.invalid" };
  await put("contacts", a);
  await put("contacts", b);
  await put("contacts", a);
  const data = await t.run(async (ctx) => ({
    clients: await ctx.db.query("clients").collect(),
    contacts: await ctx.db.query("clientContacts").collect(),
  }));
  expect(data.clients).toHaveLength(1);
  expect(data.clients[0]).toMatchObject({
    clientType: "company",
    companyName: "Test Company",
  });
  expect(data.contacts).toHaveLength(2);
  expect(data.contacts.map((x) => x.clientId)).toEqual([
    data.clients[0]._id,
    data.clients[0]._id,
  ]);
  expect(data.contacts.map((x) => x.givenName)).toEqual(["Alex", "Sam"]);
  expect(data.contacts[0].email).not.toBe(a.email);
  expect(data.contacts[0].addedAt).toBe(Date.parse("2026-09-01T20:00:00Z"));
});

it("keeps lost quotes out of active work and reconciles charges without billing added tips twice", async () => {
  const { t, put } = await fixture();
  await put("contacts", { id: 1, firstName: "Test" });
  await put("events", {
    id: 2,
    primaryContact: 1,
    title: "Lost quote",
    date: "2026-07-01",
    startTime: "12:00",
    statusModel: { name: "QUOTE (LOST)" },
  });
  await put("eventFinancials", {
    id: 2,
    event: 2,
    total: 132,
    subTotal: 100,
    foodTotal: 100,
    serviceChargeTotal: 20,
    tax1Total: 12,
    addedGratuityTotal: 10,
    paymentTotal: 0,
  });
  await put("eventStaff", {
    id: 3,
    eventId: 2,
    quantity: 1,
    jobTitle: { name: "Server" },
    staff: null,
  });
  const data = await t.run(async (ctx) => ({
    event: (await ctx.db.query("events").collect())[0],
    invoice: (await ctx.db.query("invoices").collect())[0],
    need: (await ctx.db.query("eventStaffNeeds").collect())[0],
  }));
  expect(data.event.stage).toBe("cancelled");
  expect(data.event.startsAt).toBe(Date.parse("2026-07-01T18:00:00Z"));
  expect(data.invoice).toMatchObject({
    eventId: data.event._id,
    subtotal: 120,
    taxAmount: 12,
    total: 132,
    amountPaid: 0,
    amountDue: 132,
    status: "voided",
  });
  expect(
    (data.invoice.lineItems as any[]).map((x) => [x.description, x.subtotal]),
  ).toEqual([
    ["TPP: Food", 100],
    ["TPP: Service charge", 20],
  ]);
  expect(data.need).toMatchObject({
    eventId: data.event._id,
    role: "Server",
    status: "cancelled",
  });
  await put("tasks", {
    id: 5,
    event: 2,
    cli_Subject: "Old unfinished follow-up",
    Complete: false,
  });
  expect(
    await t.run((ctx) => ctx.db.query("eventTasks").collect()),
  ).toHaveLength(0);
  expect(
    (await t.run((ctx) => ctx.db.query("clientCommunications").collect()))[0],
  ).toMatchObject({ summary: "Old unfinished follow-up", taskDone: false });
  expect(
    (
      await put("eventFinancials", {
        id: 4,
        event: 2,
        total: -50,
        paymentTotal: 0,
      })
    ).kind,
  ).toBe("needs_mapping");
  expect(await t.run((ctx) => ctx.db.query("invoices").collect())).toHaveLength(
    1,
  );
});

it("preserves fractional purchase conversion and puts service charges and equipment in their own buckets", async () => {
  const { t, put } = await fixture();
  await put("storageLocations", { id: 1, name: "Store" });
  await put("inventoryItems", {
    id: 2,
    name: "Ingredient",
    classification: "F",
    storageLocation: 1,
    inStockAmt: 3,
    instockUnitType: "P",
    timeSpans: [
      {
        startDate: "2000-01-01",
        shelfAmt: 0.5,
        purchaseAmt: 2,
        purchaseCost: 10,
        shelfUnitOfMeasurement: { name: "Pound" },
      },
    ],
  });
  await put("miscellaneousItems", {
    id: 3,
    name: "Delivery charge",
    classification: "M",
  });
  await put("inventoryItems", {
    id: 4,
    name: "Oven",
    classification: "E",
    inStockAmt: 2,
  });
  await put("contacts", { id: 5, firstName: "Test" });
  await put("events", {
    id: 6,
    primaryContact: 5,
    date: "2090-01-01",
    statusModel: { isConfirmed: true },
  });
  const line = {
    id: 7,
    event: 6,
    quantity: 1,
    inventoryItem: { id: 4, classification: "E" },
  };
  await put("eventInventoryItems", line);
  await put("eventInventoryItems", line);
  const data = await t.run(async (ctx) => ({
    ingredient: (await ctx.db.query("ingredients").collect())[0],
    stock: (await ctx.db.query("inventoryItems").collect())[0],
    dish: (await ctx.db.query("dishes").collect())[0],
    equipment: (await ctx.db.query("equipments").collect())[0],
    reservations: await ctx.db.query("equipmentReservations").collect(),
  }));
  expect(data.ingredient).toMatchObject({ unit: "pound", costPerUnit: 20 });
  expect(data.stock).toMatchObject({
    ingredientId: data.ingredient._id,
    quantityOnHand: 0.75,
    unitCost: 20,
  });
  expect(data.dish).toMatchObject({ name: "Delivery charge", kind: "service" });
  expect(data.reservations).toHaveLength(1);
  expect(data.reservations[0]).toMatchObject({
    equipmentId: data.equipment._id,
    quantity: 1,
    status: "reserved",
  });
});

it("scales recipe ingredients and subrecipes to the priced portion using compatible units", async () => {
  const { t, put } = await fixture();
  await put("inventoryItems", {
    id: 1,
    name: "Salt",
    classification: "F",
    timeSpans: [{ shelfAmt: 1, shelfUnitOfMeasurement: { name: "Gram" } }],
  });
  const timespans = (fraction: number) => [
    {
      portionPrices: [
        {
          portionSize: {
            size: 1,
            unitOfMeasurement: { name: "Serving" },
            portionsPerYield: fraction,
          },
        },
      ],
    },
  ];
  await put("menuItems", {
    id: 2,
    name: "Sauce",
    canUseAsSubRecipe: true,
    recipeYieldAmount: 1,
    recipeYieldUnitOfMeasurement: { name: "Gallon" },
    timespans: timespans(1 / 16),
  });
  await put("menuItems", {
    id: 3,
    name: "Dish",
    recipeYieldAmount: 2,
    recipeYieldUnitOfMeasurement: { name: "Serving" },
    timespans: timespans(0.5),
  });
  const detail = {
    id: 3,
    Recipe: [
      {
        Level: 1,
        recp_InventorySak: 1,
        recphis_MajorAmt: 20,
        MajorUnit: "Gram",
      },
      {
        Level: 1,
        recp_SubMenuItemSak: 2,
        recphis_MajorAmt: 1,
        MajorUnit: "Quart",
      },
    ],
  };
  expect((await put("menuItemDetails", detail)).kind).toBe("imported");
  await put("menuItemDetails", detail);
  const data = await t.run(async (ctx) => ({
    ingredients: await ctx.db.query("dishIngredients").collect(),
    components: await ctx.db.query("dishComponents").collect(),
  }));
  expect(data.ingredients).toHaveLength(1);
  expect(data.ingredients[0]).toMatchObject({ quantity: 10, unit: "gram" });
  expect(data.components).toHaveLength(1);
  expect(data.components[0].batchMultiplier).toBeCloseTo(0.125);
  expect(data.components[0].yieldQuantity).toBeCloseTo(0.125);
  expect(tppDate("2026-01-01T12:00:00", "America/Denver")).toBe(
    Date.parse("2026-01-01T19:00:00Z"),
  );
  expect(tppDate("2026-07-01T12:00:00", "America/Denver")).toBe(
    Date.parse("2026-07-01T18:00:00Z"),
  );
});
