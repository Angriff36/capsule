import { describe, expect, it } from "vitest";
import { LedgerMoney } from "../src/lib/ledgerMoney";
import { QuantityMoney } from "../src/lib/quantityMoney";

const money = new QuantityMoney();

describe("quantity money", () => {
  it("unit conversion without recorded mapping refuses instead of defaulting", () => {
    expect(money.convert({ quantity: 2, from: "tub", to: "pound" })).toEqual({
      quantity: null,
      status: "unresolved_no_mapping",
    });
    expect(money.convert({ quantity: 1, from: "cup", to: "pound" })).toEqual({
      quantity: null,
      status: "unresolved_no_density",
    });
    expect(
      money.convert({ quantity: 1, from: "each", to: "kilogram" }),
    ).toEqual({
      quantity: null,
      status: "unresolved_no_mapping",
    });
    expect(
      money.convert({ quantity: Number.NaN, from: "cup", to: "quart" }),
    ).toEqual({ quantity: null, status: "unresolved_no_mapping" });

    // Same-dimension mass/volume still converts without any mapping.
    expect(
      money.convert({ quantity: 1.05, from: "cup", to: "quart" }).quantity,
    ).toBeCloseTo(0.2625);
    expect(
      money.convert({ quantity: 1, from: "kilogram", to: "pound" }).quantity,
    ).toBeCloseTo(2.20462, 4);

    // A scoped pack mapping resolves count → base, then finishes same-dimension.
    const packMapping = {
      ingredientId: "b",
      kind: "pack" as const,
      unit: "tub",
      equalsQuantity: 3,
      equalsUnit: "pound",
    };
    expect(
      money.convert({
        quantity: 2,
        from: "tub",
        to: "ounce",
        mappings: [packMapping],
        ingredientId: "b",
      }).quantity,
    ).toBeCloseTo(96);

    // Another ingredient cannot steal the mapping — it still refuses.
    expect(
      money.convert({
        quantity: 2,
        from: "tub",
        to: "pound",
        mappings: [packMapping],
        ingredientId: "other",
      }),
    ).toEqual({ quantity: null, status: "unresolved_no_mapping" });

    // A density mapping resolves mass ↔ volume for the scoped ingredient.
    expect(
      money.convert({
        quantity: 2,
        from: "cup",
        to: "gram",
        mappings: [
          {
            ingredientId: "h",
            kind: "density",
            unit: "cup",
            equalsQuantity: 200,
            equalsUnit: "gram",
          },
        ],
        ingredientId: "h",
      }).quantity,
    ).toBeCloseTo(400);
    expect(
      money.convert({
        quantity: 2,
        from: "cup",
        to: "gram",
        ingredientId: "h",
      }),
    ).toEqual({ quantity: null, status: "unresolved_no_density" });
  });

  it("missing cost is incomplete coverage not a priced zero", () => {
    expect(money.lineCost({ quantity: 2, costPerUnit: 0 })).toBeNull();
    expect(money.lineCost({ quantity: 2, costPerUnit: Number.NaN })).toBeNull();
    expect(money.lineCost({ quantity: 2, costPerUnit: -1 })).toBeNull();
    expect(money.lineCost({ quantity: null, costPerUnit: 6.25 })).toBeNull();
    expect(money.lineCost({ quantity: 0, costPerUnit: 6.25 })).toBeNull();
    expect(money.lineCost({ quantity: 2, waste: 1.1, costPerUnit: 10.1 })).toBe(
      LedgerMoney.fromDollars(10.1)
        .times(2 * 1.1)
        .toDollars(),
    );
    expect(
      money.lineCost({ quantity: 2, waste: Number.NaN, costPerUnit: 10 }),
    ).toBe(20);
    expect(money.lineCost({ quantity: 2, costPerUnit: 6.25 })).toBe(12.5);

    expect(
      money.isCompleteCoverage({ pricedLineCount: 0, incompleteLineCount: 1 }),
    ).toBe(false);
    expect(
      money.isCompleteCoverage({ pricedLineCount: 0, incompleteLineCount: 0 }),
    ).toBe(false);
    expect(
      money.isCompleteCoverage({ pricedLineCount: 1, incompleteLineCount: 1 }),
    ).toBe(false);
    expect(
      money.isCompleteCoverage({ pricedLineCount: 1, incompleteLineCount: 0 }),
    ).toBe(true);
  });

  it("pack rounding records required, package, rounded, and remainder", () => {
    expect(money.packRound({ required: 4.5, packageSize: 5 })).toEqual({
      required: 4.5,
      packageSize: 5,
      rounded: 5,
      remainder: 0.5,
    });
    expect(money.packRound({ required: 10, packageSize: 5 })).toEqual({
      required: 10,
      packageSize: 5,
      rounded: 10,
      remainder: 0,
    });
    expect(money.packRound({ required: 0.1, packageSize: 1 })).toEqual({
      required: 0.1,
      packageSize: 1,
      rounded: 1,
      remainder: 0.9,
    });
    expect(money.packRound({ required: 4.5, packageSize: 0 })).toBeNull();
    expect(money.packRound({ required: -1, packageSize: 5 })).toBeNull();
    expect(
      money.packRound({ required: Number.NaN, packageSize: 5 }),
    ).toBeNull();
    expect(money.packRound({ required: 0, packageSize: 5 })).toEqual({
      required: 0,
      packageSize: 5,
      rounded: 0,
      remainder: 0,
    });
  });
});
