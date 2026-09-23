import { describe, expect, it } from "vitest";
import { RecordedUnitMappings } from "../src/lib/recordedUnitMappings";

const packRow = {
  ingredientId: "ing-tomato",
  kind: "pack",
  unit: "case",
  equalsQuantity: 12,
  equalsUnit: "each",
  deletedAt: null,
};

const densityRow = {
  kind: "density",
  unit: "cup",
  equalsQuantity: 240,
  equalsUnit: "gram",
  deletedAt: null,
};

describe("RecordedUnitMappings.fromRows", () => {
  it("fromRows keeps live pack/density and drops retired or invalid rows", () => {
    const kept = RecordedUnitMappings.fromRows([
      packRow,
      densityRow,
      { ...packRow, ingredientId: "ing-oil", deletedAt: 123 },
      { kind: "other", unit: "case", equalsQuantity: 1, equalsUnit: "each" },
      { kind: "pack", unit: "case", equalsQuantity: 0, equalsUnit: "each" },
      { kind: "pack", unit: "case", equalsQuantity: NaN, equalsUnit: "each" },
      { kind: "pack", unit: "", equalsQuantity: 1, equalsUnit: "each" },
    ]);

    expect(kept).toHaveLength(2);
    expect(kept[0]).toEqual({
      ingredientId: "ing-tomato",
      kind: "pack",
      unit: "case",
      equalsQuantity: 12,
      equalsUnit: "each",
    });
    expect(kept[1]).toEqual({
      kind: "density",
      unit: "cup",
      equalsQuantity: 240,
      equalsUnit: "gram",
    });
  });

  it("fromRows of null or undefined is an empty list", () => {
    expect(RecordedUnitMappings.fromRows(null)).toEqual([]);
    expect(RecordedUnitMappings.fromRows(undefined)).toEqual([]);
  });
});
