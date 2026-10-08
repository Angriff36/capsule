import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PackListItemTable } from "../../../src/features/logistics/PackListItemTable";
import { explainPackLine } from "../../../src/features/logistics/packLineExplanation";
import { serializePackSources } from "../../../src/lib/packRules";

const ruleLine = {
  _id: "item_pans",
  description: "Half hotel pan",
  requiredQuantity: 6,
  packedQuantity: 0,
  unit: "each",
  status: "listed",
  version: 3,
  generationKey: "half hotel pan|each|rented|return",
  generatedQuantity: 6,
  category: "holding",
  ownership: "rented",
  returnRequired: true,
  returnNote: "Party Rentals pick up Monday",
  sourcesJson: serializePackSources([
    {
      sourceType: "dish",
      sourceId: "ed_chicken",
      sourceLabel: "Chicken piccata",
      ruleId: "rule_pan",
      ruleVersion: 2,
      formula: "40 servings / 10 each = 4",
      quantity: 4,
    },
    {
      sourceType: "dish",
      sourceId: "ed_beef",
      sourceLabel: "Beef tips",
      ruleId: "rule_pan",
      ruleVersion: 2,
      formula: "20 servings / 10 each = 2",
      quantity: 2,
    },
  ]),
};

function renderTable(items: Array<Record<string, unknown>>) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(PackListItemTable, {
        loading: false,
        items: items as never,
        canAddItems: true,
        canEditLines: true,
        busy: null,
        dishName: () => null,
        packedByName: () => null,
        itemActions: () => [],
        onAdd: () => {},
        onInvokeItem: () => {},
        canSelectItem: () => false,
        isItemSelected: () => false,
        allSelected: false,
        onToggleItem: () => {},
        onToggleAll: () => {},
        selectableCount: 0,
      }),
    ),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");
}

describe("pack line explanation (AC-537)", () => {
  it("a generated line renders its source, formula inputs and rule version", () => {
    const text = renderTable([ruleLine]);
    expect(text).toContain("Why 6?");
    expect(text).toContain("From the pack rules");
    expect(text).toContain(
      "Chicken piccata: 40 servings / 10 each = 4 (rule version 2)",
    );
    expect(text).toContain(
      "Beef tips: 20 servings / 10 each = 2 (rule version 2)",
    );
    expect(text).toContain(
      "Hot or cold holding · Rented · Party Rentals pick up Monday",
    );
  });

  it("names kit, container, template and hand-added lines, and a hand-set amount", () => {
    expect(
      explainPackLine({
        requiredQuantity: 2,
        unit: "each",
        serviceStyleKitItemId: "kit_1",
      }).origin,
    ).toBe("From the service style kit");
    const container = explainPackLine({
      requiredQuantity: 4,
      unit: "each",
      dishContainerId: "dc_1",
      containerServings: 40,
    });
    expect(container.origin).toBe("From the dish's container");
    expect(container.reasons).toEqual([
      "40 servings on the menu, about 10 servings a container",
    ]);
    expect(
      explainPackLine({
        requiredQuantity: 4,
        unit: "each",
        packListTemplateId: "t_1",
        templateVersion: 3,
      }).origin,
    ).toBe("From a template (version 3)");
    expect(explainPackLine({ requiredQuantity: 1, unit: "each" }).origin).toBe(
      "Added by hand",
    );
    const handSet = explainPackLine({
      ...ruleLine,
      requiredQuantity: 100,
      generatedQuantity: 80,
      followsDishServings: false,
    });
    expect(handSet.details).toContain(
      "Amount set by hand. The rules say 80 each.",
    );
  });
});

describe("manual pack exceptions on the sheet (AC-536)", () => {
  it("operator item, override and client-provided substitution survive recalculation", () => {
    const text = renderTable([
      {
        _id: "manual",
        description: "Client's cake stand",
        requiredQuantity: 1,
        packedQuantity: 0,
        unit: "each",
        status: "listed",
        version: 1,
      },
      {
        ...ruleLine,
        _id: "napkins",
        description: "Napkins",
        requiredQuantity: 100,
        generatedQuantity: 80,
        followsDishServings: false,
        sourcesJson: "[]",
      },
      {
        _id: "paella",
        description: "Paella pan",
        requiredQuantity: 2,
        packedQuantity: 0,
        unit: "each",
        status: "listed",
        version: 4,
        excludedAt: 1,
        exclusionReason: "Paella goes in the client's pan",
        replacementDescription: "Client's pan",
        coveredBy: "client",
      },
    ]);
    expect(text).toContain("Client's cake stand");
    expect(text).toContain("Added by hand");
    expect(text).toContain("Amount set by hand. The rules say 80 each.");
    expect(text).toContain(
      "Left off: Paella goes in the client's pan. Stand-in: Client's pan. Covered because the client brings it",
    );
    expect(text).toContain("Put back");
    expect(text).toContain("Leave off");
  });
});
