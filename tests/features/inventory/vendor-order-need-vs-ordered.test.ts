/**
 * AC-082: an order line shows the exact need and the ordered quantity, keeps
 * fractions, and rounds to whole packs only as an explicit buyer choice.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  packRounding,
  type PackMapping,
} from "../../../src/features/inventory/packRounding";
import { VendorOrderLinePacks } from "../../../src/features/inventory/VendorOrderLinePacks";

const caseOf6kg: PackMapping = {
  ingredientId: "flour",
  kind: "pack",
  unit: "case",
  equalsQuantity: 6,
  equalsUnit: "kilogram",
  recordedAt: 1,
  deletedAt: null,
};

const line = {
  _id: "line-1",
  ingredientId: "flour",
  unit: "kilogram",
  status: "added",
  orderedQuantity: 13.5,
  plannedQuantity: 13.5,
};

const render = (props: Partial<Parameters<typeof VendorOrderLinePacks>[0]>) =>
  renderToStaticMarkup(
    createElement(VendorOrderLinePacks, {
      line,
      mappings: [caseOf6kg],
      canEdit: true,
      busy: false,
      onOrderPacks: () => {},
      ...props,
    }),
  );

describe("an order line shows exact need and ordered quantity and any explicit pack rounding", () => {
  it("keeps the fractional need and works out whole packs and the extra", () => {
    expect(
      packRounding({
        need: 13.5,
        lineUnit: "kilogram",
        ingredientId: "flour",
        mappings: [caseOf6kg],
      }),
    ).toEqual({
      need: 13.5,
      lineUnit: "kilogram",
      packUnit: "case",
      packSize: 6,
      packs: 3,
      roundedQuantity: 18,
      extra: 4.5,
    });
  });

  it("converts a pack recorded in another unit of the same kind", () => {
    const result = packRounding({
      need: 1500,
      lineUnit: "gram",
      ingredientId: "flour",
      mappings: [caseOf6kg],
    });
    expect(result?.packSize).toBe(6000);
    expect(result?.packs).toBe(1);
    expect(result?.extra).toBe(4500);
  });

  it("never guesses a pack that does not convert, or one that is retired or for another item", () => {
    for (const mappings of [
      [{ ...caseOf6kg, equalsUnit: "liter" }],
      [{ ...caseOf6kg, deletedAt: 5 }],
      [{ ...caseOf6kg, ingredientId: "sugar" }],
      [{ ...caseOf6kg, kind: "density" }],
    ]) {
      expect(
        packRounding({
          need: 13.5,
          lineUnit: "kilogram",
          ingredientId: "flour",
          mappings,
        }),
      ).toBeNull();
    }
  });

  it("an exact multiple leaves nothing over", () => {
    const result = packRounding({
      need: 12,
      lineUnit: "kilogram",
      ingredientId: "flour",
      mappings: [caseOf6kg],
    });
    expect(result?.packs).toBe(2);
    expect(result?.extra).toBe(0);
  });

  it("shows need, ordered amount, the pack sum and a round-up button on a draft", () => {
    const html = render({});
    expect(html).toContain("Needed 13.5 kilogram · ordering 13.5 kilogram");
    expect(html).toContain("Sold by the case (6 kilogram)");
    expect(html).toContain("3 cases = 18 kilogram, 4.5 kilogram left over");
    expect(html).toContain("Order 3 cases (18 kilogram)");
  });

  it("after rounding, shows the need and the rounded order side by side with no button", () => {
    const html = render({ line: { ...line, orderedQuantity: 18 } });
    expect(html).toContain("Needed 13.5 kilogram · ordering 18 kilogram");
    expect(html).not.toContain("<button");
  });

  it("offers no round-up once the order is sent, and says when no pack is recorded", () => {
    expect(render({ canEdit: false })).not.toContain("<button");
    expect(render({ mappings: [] })).toContain(
      "No pack size recorded, so the exact amount is ordered.",
    );
  });
});
