import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ItemUnitMappingsPanel } from "../src/features/kitchen/ItemUnitMappingsPanel";

vi.mock("../src/lib/manifest-convex-react", () => ({
  useListItemUnitMapping: () => [],
  useCreateItemUnitMapping: () => vi.fn(),
  useItemUnitMappingRetire: () => vi.fn(),
}));

vi.mock("../src/ui/action-prompt", () => ({
  useActionPrompt: () => ({ prompt: vi.fn(), host: null }),
}));

function unitOptions(markup: string, selectName: string): string[] {
  const select = new RegExp(
    `<select[^>]*name="${selectName}"[^>]*>(.*?)</select>`,
    "s",
  ).exec(markup);
  return [
    ...(select?.[1] ?? "").matchAll(/<option[^>]*>([^<]*)<\/option>/g),
  ].map((match) => match[1]!);
}

function renderPanel(ingredientUnit: string) {
  return renderToStaticMarkup(
    createElement(ItemUnitMappingsPanel, {
      ingredientId: "ing1",
      ingredientUnit,
      onFailure: () => undefined,
    }),
  );
}

describe("ItemUnitMappingsPanel unit selectors", () => {
  it("offers each unit exactly once, pack units included", () => {
    const markup = renderPanel("pound");
    for (const name of ["unit", "equalsUnit"]) {
      const options = unitOptions(markup, name);
      expect(new Set(options).size).toBe(options.length);
      expect(options).toEqual(
        expect.arrayContaining([
          "each",
          "pound",
          "case",
          "package",
          "can",
          "tub",
          "piece",
          "slice",
          "pizza",
          "fluid_ounce",
        ]),
      );
    }
  });

  it("adds an import-only ingredient unit once", () => {
    const options = unitOptions(renderPanel("melon"), "equalsUnit");
    expect(options.filter((unit) => unit === "melon")).toHaveLength(1);
    expect(new Set(options).size).toBe(options.length);
  });
});
