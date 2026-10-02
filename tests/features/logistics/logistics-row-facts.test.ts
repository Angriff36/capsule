import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PackListItemTable } from "../../../src/features/logistics/PackListItemTable";
import { packRowFacts } from "../../../src/features/logistics/packRowFacts";
import { serializePackSources } from "../../../src/lib/packRules";

const chafers = {
  _id: "item_chafers",
  description: "Chafing dish",
  requiredQuantity: 6,
  packedQuantity: 4,
  unit: "each",
  status: "listed",
  version: 2,
  generationKey: "chafing dish|each|rented|return",
  generatedQuantity: 6,
  category: "holding",
  ownership: "rented",
  returnRequired: true,
  sourcesJson: serializePackSources([
    {
      sourceType: "rental",
      sourceId: "res_1",
      sourceLabel: "Rented Chafing dish held for this event",
      ruleId: null,
      ruleVersion: null,
      formula: "6 held",
      quantity: 6,
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
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

describe("pack row facts (AC-554)", () => {
  it("a pack row shows source, required/packed, missing state and the single blocking item when not ready", () => {
    const missing = {
      _id: "item_cutter",
      description: "Cake cutter",
      requiredQuantity: 1,
      packedQuantity: 0,
      unit: "each",
      status: "missing",
      version: 1,
    };
    const text = renderTable([chafers, missing]);
    // Source and rule working, ownership and return duty.
    expect(text).toContain("From the pack rules");
    expect(text).toContain("Rented Chafing dish held for this event: 6 held");
    expect(text).toContain("Hot or cold holding · Rented · Comes back");
    // Required, packed, held and still to pack.
    expect(text).toContain("6 each");
    expect(text).toContain("4 each");
    expect(text).toContain("Held for this event 6");
    expect(text).toContain("Still to pack 2 each");
    // Only the missing line holds up Mark packed, and it says why.
    expect(text.match(/Holds up Mark packed/g)).toHaveLength(1);
    expect(packRowFacts(missing).blocking).toBe(
      '"Cake cutter" is marked missing. Record what went instead, or leave it off with a reason.',
    );
    expect(packRowFacts(chafers).blocking).toBeNull();
  });

  it("after loading, the row says how many still have to come back until the return count", () => {
    const loaded = { ...chafers, packedQuantity: 6, loadedQuantity: 6 };
    expect(packRowFacts(loaded)).toMatchObject({
      toPack: 0,
      toComeBack: 6,
      notes: ["Held for this event 6", "To come back 6"],
    });
    const counted = {
      ...loaded,
      returnedQuantity: 5,
      damagedQuantity: 1,
      returnCountedAt: 1,
    };
    expect(packRowFacts(counted).toComeBack).toBe(0);
    expect(renderTable([counted])).toContain("Back 5 · broken 1");
  });

  it("a left-off line owes nothing, and a left-off must-have with no stand-in blocks", () => {
    const leftOff = {
      ...chafers,
      packedQuantity: 0,
      excludedAt: 1,
      exclusionReason: "Venue has its own",
      coveredBy: "vendor",
    };
    expect(packRowFacts(leftOff)).toMatchObject({ toPack: 0, blocking: null });
    const mustHave = {
      ...leftOff,
      coveredBy: null,
      requiredCapability: true,
    };
    expect(packRowFacts(mustHave).blocking).toContain("is a must-have");
  });
});
