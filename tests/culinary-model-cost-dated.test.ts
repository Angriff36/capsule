// AC-071 (PR03-06) / AC-454 (BE-9.6): an ingredient price carries its unit,
// date and source. A recipe is costed with the receipt price in force on the
// costing date; without one it uses the catalog price marked undated; a $0,
// missing or unconvertible price is unknown, never free, so the recipe cost
// can only say "complete" when every line has a real price.
import { describe, expect, it } from "vitest";
import {
  componentBatchCost,
  type ComponentLike,
  type IngredientLike,
} from "../convex/lib/culinaryModel/costing";
import {
  ingredientPriceAt,
  type PriceObservationLike,
} from "../convex/lib/culinaryModel/pricing";

const day = (d: number) => Date.UTC(2026, 8, d, 12);

const receipt = (
  id: string,
  observedAt: number | null,
  unitPrice: number,
  unit: PriceObservationLike["unit"] = "pound",
): PriceObservationLike => ({
  id,
  ingredientId: "ing-butter",
  vendorId: `vendor-${id}`,
  vendorOrderId: `order-${id}`,
  unit,
  unitPrice,
  observedAt,
});

const butter: IngredientLike = {
  id: "ing-butter",
  name: "Butter",
  unit: "pound",
  costPerUnit: 4,
  observations: [receipt("r1", day(1), 5), receipt("r2", day(10), 6)],
};
const flour: IngredientLike = {
  id: "ing-flour",
  name: "Flour",
  unit: "pound",
  costPerUnit: 1,
};
const salt: IngredientLike = {
  id: "ing-salt",
  name: "Salt",
  unit: "pound",
  costPerUnit: 0,
};
const saffron: IngredientLike = {
  id: "ing-saffron",
  name: "Saffron",
  unit: "gram",
  costPerUnit: null,
};

const line = (
  id: string,
  ingredientId: string,
  quantity: number,
  unit: ComponentLike["ingredientLines"][number]["unit"],
) => ({
  id,
  ingredientId,
  quantity,
  unit,
  quantityBasis: "as_purchased" as const,
});

const recipe = (lines: ComponentLike["ingredientLines"]): ComponentLike => ({
  id: "cmp-dough",
  name: "Dough",
  yieldQuantity: 10,
  yieldUnit: "portion",
  instructions: "Mix.",
  stepCount: 1,
  ingredientLines: lines,
  componentLines: [],
});

const lookups = (component: ComponentLike, asOf: number | null) => ({
  components: new Map([[component.id, component]]),
  ingredients: new Map(
    [butter, flour, salt, saffron].map((i) => [i.id, i] as const),
  ),
  mappings: [],
  asOf,
});

describe("culinary model: dated ingredient cost", () => {
  it("a recipe costs with the observation effective at the event date, or reports the price as undated/unknown", () => {
    // Event on day 5: the day-1 receipt ($5/lb) is in force, not the later day-10 one.
    const dough = recipe([
      line("l1", "ing-butter", 2, "pound"),
      line("l2", "ing-flour", 3, "pound"),
    ]);
    const onDay5 = componentBatchCost(dough.id, lookups(dough, day(5)));
    expect(onDay5.confidence).toBe("complete");
    expect(onDay5.knownSubtotal).toBe(13);
    const butterLine = onDay5.lines.find((l) => l.lineId === "l1")!;
    expect(butterLine).toMatchObject({
      cost: 10,
      priceSource: "receipt",
      priceEffectiveAt: day(1),
      vendorId: "vendor-r1",
      undated: false,
    });
    // Flour has no receipt: catalog price, flagged undated.
    expect(onDay5.lines.find((l) => l.lineId === "l2")).toMatchObject({
      cost: 3,
      priceSource: "catalog",
      priceEffectiveAt: null,
      undated: true,
    });
    expect(onDay5.undatedLines).toBe(1);

    // Today (no date) uses the newest receipt.
    expect(
      componentBatchCost(dough.id, lookups(dough, null)).knownSubtotal,
    ).toBe(15);
    // Before any receipt the catalog price is used, marked undated.
    const beforeReceipts = componentBatchCost(dough.id, lookups(dough, day(0)));
    expect(beforeReceipts.knownSubtotal).toBe(11);
    expect(beforeReceipts.undatedLines).toBe(2);
  });

  it("recipe cost uses the observation effective at the event date or reports the price as unknown", () => {
    const dough = recipe([
      line("l1", "ing-butter", 1, "pound"),
      line("l2", "ing-salt", 1, "pound"),
      line("l3", "ing-saffron", 1, "gram"),
      line("l4", "ing-flour", 2, "cup"),
    ]);
    const report = componentBatchCost(dough.id, lookups(dough, day(12)));
    // $0 salt, unpriced saffron and unconvertible flour cups are unknown, not free.
    expect(report.confidence).toBe("partial");
    expect(report.knownSubtotal).toBe(6);
    expect(report.unknownLines).toBe(3);
    expect(report.lines.find((l) => l.lineId === "l2")).toMatchObject({
      known: false,
      cost: null,
      reason: "priced at $0",
    });
    expect(report.lines.find((l) => l.lineId === "l3")).toMatchObject({
      known: false,
      cost: null,
      reason: "no price",
    });
    expect(report.lines.find((l) => l.lineId === "l4")?.known).toBe(false);
    // All lines unknown: no cost at all, never a "$0 complete".
    const unpriced = recipe([line("l1", "ing-salt", 1, "pound")]);
    const none = componentBatchCost(unpriced.id, lookups(unpriced, day(12)));
    expect(none.confidence).toBe("none");
  });

  it("the price rule itself: receipt unit wins, $0 and unrecorded receipts are skipped", () => {
    const catalog = { unit: "pound" as const, costPerUnit: 0 };
    expect(
      ingredientPriceAt(catalog, [receipt("z", day(1), 0)], day(2)),
    ).toEqual({ status: "unknown", reason: "priced at $0" });
    expect(
      ingredientPriceAt(
        { unit: "pound", costPerUnit: null },
        [receipt("u", null, 9)],
        day(2),
      ),
    ).toEqual({ status: "unknown", reason: "no price" });
    expect(
      ingredientPriceAt(
        catalog,
        [receipt("k", day(1), 20, "kilogram")],
        day(2),
      ),
    ).toMatchObject({
      status: "known",
      source: "receipt",
      unit: "kilogram",
      unitPrice: 20,
      effectiveAt: day(1),
      vendorOrderId: "order-k",
    });
  });

  it("a receipt priced per kilogram costs a recipe written in pounds", () => {
    const kiloButter: IngredientLike = {
      ...butter,
      observations: [receipt("kg", day(1), 10, "kilogram")],
    };
    const dough = recipe([line("l1", "ing-butter", 2.2046226, "pound")]);
    const report = componentBatchCost(dough.id, {
      ...lookups(dough, day(5)),
      ingredients: new Map([[kiloButter.id, kiloButter]]),
    });
    expect(report.confidence).toBe("complete");
    expect(report.knownSubtotal).toBeCloseTo(10, 2);
  });
});
