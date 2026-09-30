/**
 * Runtime proof (AC-075 PR04-01, with the persisted side of AC-076 PR04-02):
 * a count sheet imported through the real one-shot import stages one opening
 * stock record per row, sorted into food, equipment, disposables, made in
 * house and instructions. Each keeps its amount, unit, place, count time,
 * source file and how sure the count is. The import writes NO on-hand stock:
 * rows with gaps stay open on their own record, and only a ready food record
 * a person picks becomes the opening stock, in the catalog unit. Re-importing
 * the same sheet adds nothing.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  harness,
  runner,
  type Proof,
  type Role,
} from "./headcount-prep-reconciliation.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actions = { action: (fn: unknown, args?: unknown) => Promise<unknown> };
const asActions = (role: Role) => role as unknown as Actions;

type StockRecord = {
  _id: string;
  itemName: string;
  kind: string;
  ingredientId?: string | null;
  componentId?: string | null;
  locationId?: string | null;
  locationName: string;
  quantity?: number | null;
  sourceUnit: string;
  unit?: string | null;
  catalogQuantity?: number | null;
  asOfAt?: number | null;
  countState: string;
  status: string;
  issues: string;
  sourceFile: string;
  sourceRow: string;
  sourceSystem: string;
  importRunId?: string | null;
  deletedAt?: number | null;
  version: number;
};

async function records(role: Role): Promise<StockRecord[]> {
  return (await role.run(async (ctx) =>
    ctx.db.query("openingStockRecords").collect(),
  )) as unknown as StockRecord[];
}

async function stockLines(role: Role) {
  return (await role.run(async (ctx) =>
    ctx.db.query("inventoryItems").collect(),
  )) as unknown as Array<{
    _id: string;
    ingredientId: string;
    locationId: string;
    quantityOnHand: number;
    unit: string;
  }>;
}

const SHEET = "opening-count-2026-09-01.csv";
const COUNTED_AT = Date.parse("2026-09-01T12:00:00Z");

const sheet = [
  {
    Item: "Flour",
    Type: "Food",
    Qty: "640",
    Unit: "oz",
    Location: "Dry storage",
    "As of": "2026-09-01",
    Counted: "yes",
  },
  {
    Item: "Heavy cream",
    Type: "Dairy",
    Qty: "2",
    Unit: "case",
    Location: "Walk-in",
    "As of": "2026-09-01",
    Counted: "yes",
  },
  {
    Item: "Heavy cream",
    Type: "Dairy",
    Qty: "",
    Unit: "qt",
    Location: "Walk-in",
    "As of": "2026-09-02",
    Counted: "no",
  },
  {
    Item: "Chafing dish",
    Type: "Equipment",
    Qty: "14",
    Unit: "each",
    Location: "Dry storage",
    "As of": "2026-09-01",
    Counted: "yes",
  },
  {
    Item: "9 inch plates",
    Type: "Disposables",
    Qty: "3",
    Unit: "case",
    Location: "Dry storage",
    "As of": "2026-09-01",
    Counted: "estimate",
  },
  {
    Item: "House vinaigrette",
    Type: "",
    Qty: "4",
    Unit: "qt",
    Location: "Walk-in",
    "As of": "2026-09-01",
    Counted: "yes",
  },
  {
    Item: "Rotate the walk-in stock so the oldest items are used first",
    Type: "Note",
    Qty: "",
    Unit: "",
    Location: "",
    "As of": "",
    Counted: "",
  },
  {
    Item: "Mystery tub",
    Type: "",
    Qty: "1",
    Unit: "tub",
    Location: "Freezer 9",
    "As of": "2026-09-01",
    Counted: "yes",
  },
].map((row) => ({ ...row, SourceFile: SHEET }));

async function seed(proof: Proof, tenantId: string) {
  const owner = proof.asRole({
    subject: `opening-stock-owner-${tenantId}`,
    role: "owner",
    tenantId,
  });
  const run = runner(proof, owner);
  const flour = await run(api.mutations.Ingredient_createViaIntroduce, {
    name: "Flour",
    unit: "pound",
    costPerUnit: 1,
    allergens: [],
    category: "pantry",
  });
  const cream = await run(api.mutations.Ingredient_createViaIntroduce, {
    name: "Heavy cream",
    unit: "quart",
    costPerUnit: 4,
    allergens: ["milk"],
    category: "dairy",
  });
  const vinaigrette = await run(api.mutations.Component_createViaDraft, {
    name: "House vinaigrette",
    yieldQuantity: 1,
    yieldUnit: "quart",
    batchMultiplier: 1,
  });
  const dry = await run(api.mutations.StorageLocation_createViaRegister, {
    name: "Dry storage",
    locationType: "dry",
  });
  const walkIn = await run(api.mutations.StorageLocation_createViaRegister, {
    name: "Walk-in",
    locationType: "cold",
  });
  return { owner, flour, cream, vinaigrette, dry, walkIn };
}

describe("runtime proof: opening stock import (AC-075, AC-076)", () => {
  it("an imported opening stock row records as-of time, location, catalog unit, source file and an explicit uncertainty state, and equipment/instruction rows are separated", async () => {
    const proof = harness();
    const tenantId = "tenant-opening-stock";
    const { owner, flour, cream, vinaigrette, dry, walkIn } = await seed(
      proof,
      tenantId,
    );

    const result = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "stock",
      sourceSystem: "csv_export",
      rows: sheet,
    })) as { importRunId: string; committed: number; skipped: number };
    expect(result.committed).toBe(sheet.length);

    // Nothing reached on-hand stock at import.
    expect(await stockLines(owner)).toHaveLength(0);

    const staged = await records(owner);
    expect(staged).toHaveLength(sheet.length);
    const byName = (name: string, qty?: number | null) =>
      staged.find(
        (row) =>
          row.itemName === name &&
          (qty === undefined || (row.quantity ?? null) === qty),
      )!;

    // Food row: every fact kept, converted to the catalog unit exactly.
    const flourRow = byName("Flour");
    expect(flourRow).toMatchObject({
      kind: "ingredient",
      ingredientId: flour.docId,
      locationId: dry.docId,
      locationName: "Dry storage",
      quantity: 640,
      sourceUnit: "oz",
      unit: "ounce",
      catalogQuantity: 40,
      asOfAt: COUNTED_AT,
      countState: "counted",
      status: "ready",
      issues: "[]",
      sourceFile: SHEET,
      sourceSystem: "csv_export",
      importRunId: result.importRunId,
    });

    // Sorted by what they are.
    expect(byName("Chafing dish").kind).toBe("equipment");
    expect(byName("9 inch plates").kind).toBe("disposable");
    expect(byName("House vinaigrette")).toMatchObject({
      kind: "component",
      componentId: vinaigrette.docId,
    });
    const note = byName(
      "Rotate the walk-in stock so the oldest items are used first",
    );
    expect(note).toMatchObject({
      kind: "instruction",
      status: "ready",
      issues: "[]",
    });
    expect(note.quantity ?? null).toBeNull();

    // Uncertainty is explicit, never defaulted to "counted".
    expect(byName("9 inch plates").countState).toBe("estimated");
    expect(JSON.parse(byName("9 inch plates").issues)).toContain(
      "unverified_count",
    );

    // AC-076 persisted: a case of cream with no pack size is held, not guessed.
    const creamCase = byName("Heavy cream", 2);
    expect(creamCase).toMatchObject({ status: "needs_review", unit: "case" });
    expect(creamCase.catalogQuantity ?? null).toBeNull();
    expect(JSON.parse(creamCase.issues)).toContain("unit_incompatible");
    // A blank, unchecked cream count stays blank - never zero.
    const creamBlank = byName("Heavy cream", null);
    expect(creamBlank.quantity ?? null).toBeNull();
    expect(JSON.parse(creamBlank.issues)).toEqual(
      expect.arrayContaining(["missing_quantity", "unverified_count"]),
    );
    // An unknown item and place stay unsorted and unmatched.
    const mystery = byName("Mystery tub");
    expect(mystery).toMatchObject({
      kind: "unsorted",
      status: "needs_review",
      locationName: "Freezer 9",
    });
    expect(mystery.locationId ?? null).toBeNull();
    expect(JSON.parse(mystery.issues)).toEqual(
      expect.arrayContaining(["unsorted_kind", "unknown_location"]),
    );

    // A held record cannot open stock.
    await expect(
      owner.mutation(api.openingStock.applyOpeningStock, {
        recordId: creamCase._id,
      }),
    ).rejects.toThrow(/open issues/);
    expect(await stockLines(owner)).toHaveLength(0);

    // The person fixes the cream count in the catalog unit; it becomes ready.
    await owner.mutation(api.openingStock.reviewOpeningStock, {
      recordId: creamCase._id,
      kind: "ingredient",
      ingredientId: cream.docId,
      locationId: walkIn.docId,
      quantity: 24,
      unit: "quart",
      asOfAt: COUNTED_AT,
      countState: "counted",
    });
    const fixed = (await records(owner)).find(
      (row) => row._id === creamCase._id,
    )!;
    expect(fixed).toMatchObject({
      status: "ready",
      issues: "[]",
      catalogQuantity: 24,
      sourceUnit: "case",
    });

    // The person picks the opening basis: flour and the fixed cream.
    await owner.mutation(api.openingStock.applyOpeningStock, {
      recordId: flourRow._id,
    });
    await owner.mutation(api.openingStock.applyOpeningStock, {
      recordId: creamCase._id,
    });
    const lines = await stockLines(owner);
    expect(
      lines
        .map((line) => [
          line.ingredientId,
          line.locationId,
          line.quantityOnHand,
          line.unit,
        ])
        .sort(),
    ).toEqual(
      [
        [flour.docId, dry.docId, 40, "pound"],
        [cream.docId, walkIn.docId, 24, "quart"],
      ].sort(),
    );
    expect(
      (await records(owner)).find((row) => row._id === flourRow._id)!.status,
    ).toBe("applied");

    // Re-importing the same sheet adds nothing.
    const again = (await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "stock",
      sourceSystem: "csv_export",
      rows: sheet,
    })) as { committed: number; skipped: number };
    expect(again.committed).toBe(0);
    expect(again.skipped).toBe(sheet.length);
    expect(await records(owner)).toHaveLength(sheet.length);
    expect(await stockLines(owner)).toHaveLength(2);
  });

  it("two counts of the same item and place on the same day clash until one is set aside", async () => {
    const proof = harness();
    const tenantId = "tenant-opening-stock-clash";
    const { owner } = await seed(proof, tenantId);
    const rows = [
      {
        Item: "Flour",
        Type: "Food",
        Qty: "40",
        Unit: "lb",
        Location: "Dry storage",
        "As of": "2026-09-01",
        Counted: "yes",
        SourceFile: SHEET,
      },
      {
        Item: "Flour",
        Type: "Food",
        Qty: "36",
        Unit: "lb",
        Location: "Dry storage",
        "As of": "2026-09-01",
        Counted: "yes",
        SourceFile: "second-count.csv",
      },
    ];
    await asActions(owner).action(api.quickImport.importFile, {
      datasetType: "stock",
      sourceSystem: "csv_export",
      rows,
    });
    const [a, b] = await records(owner);
    for (const row of [a, b]) {
      expect(row.status).toBe("needs_review");
      expect(JSON.parse(row.issues)).toEqual(["conflicting_snapshot"]);
    }
    const wrong = a.quantity === 36 ? a : b;
    const right = wrong === a ? b : a;
    await owner.mutation(api.openingStock.setAsideOpeningStock, {
      recordId: wrong._id,
      reason: "Second count was taken after a delivery came in",
    });
    const after = await records(owner);
    expect(after.find((row) => row._id === wrong._id)!.status).toBe(
      "set_aside",
    );
    expect(after.find((row) => row._id === right._id)).toMatchObject({
      status: "ready",
      issues: "[]",
    });
    expect(await stockLines(owner)).toHaveLength(0);
  });
});
