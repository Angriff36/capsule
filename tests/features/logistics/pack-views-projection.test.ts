import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PackListViews } from "../../../src/features/logistics/PackListViews";
import {
  comesBack,
  packView,
  type PackViewKind,
} from "../../../src/features/logistics/packViews";
import { serializePackSources } from "../../../src/lib/packRules";

const dishSource = (id: string, label: string) =>
  serializePackSources([
    {
      sourceType: "dish",
      sourceId: id,
      sourceLabel: label,
      ruleId: "r1",
      ruleVersion: 1,
      formula: "40 servings / 20 each = 2",
      quantity: 2,
    },
  ]);

const base = { unit: "each", status: "listed", version: 1, packedQuantity: 0 };
const lines = [
  {
    ...base,
    _id: "container",
    description: "Lasagna container",
    requiredQuantity: 4,
    dishId: "dish_lasagna",
    eventDishId: "ed_lasagna",
    dishContainerId: "dc1",
  },
  {
    ...base,
    _id: "tongs",
    description: "Tongs",
    requiredQuantity: 2,
    generationKey: "k1",
    category: "utensil",
    ownership: "owned",
    returnRequired: true,
    sourcesJson: dishSource("ed_lasagna", "Lasagna"),
  },
  {
    ...base,
    _id: "napkins",
    description: "Napkins",
    requiredQuantity: 44,
    generationKey: "k2",
    category: "disposable",
    ownership: "owned",
    returnRequired: false,
    sourcesJson: serializePackSources([
      {
        sourceType: "guest_count",
        sourceId: "e1",
        sourceLabel: "40 guests",
        ruleId: "r2",
        ruleVersion: 1,
        formula: "40 guests",
        quantity: 44,
      },
    ]),
  },
  {
    ...base,
    _id: "chargers",
    description: "Gold charger",
    requiredQuantity: 40,
    generationKey: "k3",
    category: "rental",
    ownership: "rented",
    returnRequired: true,
    loadAssignmentId: "rig_trailer",
    sourcesJson: serializePackSources([
      {
        sourceType: "rental",
        sourceId: "hold1",
        sourceLabel: "Rented Gold charger held for this event",
        ruleId: null,
        ruleVersion: null,
        formula: "40 held",
        quantity: 40,
      },
    ]),
  },
  {
    ...base,
    _id: "skirt",
    description: "Buffet skirt",
    requiredQuantity: 2,
    serviceStyleKitItemId: "kit1",
  },
  {
    ...base,
    _id: "stand",
    description: "Cake stand",
    requiredQuantity: 1,
    excludedAt: 1,
    exclusionReason: "Client brings it",
    coveredBy: "client",
  },
];
const rigs = [
  { id: "rig_truck", label: "Box truck 2" },
  { id: "rig_trailer", label: "Trailer A" },
];
const ctx = {
  dishName: (id: string) => (id === "dish_lasagna" ? "Lasagna" : null),
  rigs,
};

function render(view: PackViewKind, items: typeof lines) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(PackListViews, {
        view,
        onViewChange: () => {},
        rigs,
        items: items as never,
        loading: false,
        canAddItems: true,
        canEditLines: true,
        busy: null,
        dishName: (id?: string | null) => (id ? ctx.dishName(id) : null),
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
  );
}

const ids = (html: string) =>
  [...html.matchAll(/data-line-id="([^"]+)"/g)].map((m) => m[1]).sort();
const packedOf = (html: string, id: string) =>
  new RegExp(
    `data-line-id="${id}".*?<td data-label="Packed">(\\d+) each`,
    "s",
  ).exec(html)?.[1];

describe("four pack views of one line set (AC-540, AC-381)", () => {
  it("the four views render the same line ids and a pack in one view shows in all four", () => {
    const all = ids(render("all", lines));
    expect(ids(render("reference", lines))).toEqual(all);
    expect(ids(render("warehouse", lines))).toEqual(all);
    // The load leaves out what is not going; returns keep only what comes back.
    expect(ids(render("load", lines))).toEqual(
      all.filter((id) => id !== "stand"),
    );
    expect(ids(render("returns", lines))).toEqual([
      "chargers",
      "container",
      "skirt",
      "tongs",
    ]);

    // The packer saves 3 of 4 containers from the warehouse walk: the saved
    // row comes back and every view shows 3.
    const packed = lines.map((line) =>
      line._id === "container" ? { ...line, packedQuantity: 3 } : line,
    );
    for (const view of [
      "all",
      "reference",
      "warehouse",
      "load",
      "returns",
    ] as const)
      expect(packedOf(render(view, packed), "container"), view).toBe("3");
  });

  it("groups each view the way its crew works (reference by dish and purpose, warehouse by kind, load by truck, returns by who takes it)", () => {
    const labels = (view: PackViewKind) =>
      packView(view, lines, ctx).map((g) => [
        g.label,
        g.lines.map((l) => l._id),
      ]);
    expect(labels("reference")).toEqual([
      ["Lasagna", ["container", "tongs"]],
      ["Service style", ["skirt"]],
      ["For the guests", ["napkins"]],
      ["Rentals and held equipment", ["chargers"]],
      ["Added by hand", ["stand"]],
    ]);
    expect(labels("warehouse")).toEqual([
      ["Dish containers", ["container"]],
      ["Utensil", ["tongs"]],
      ["Disposables", ["napkins"]],
      ["Rental", ["chargers"]],
      ["Style kit", ["skirt"]],
      ["Other", ["stand"]],
    ]);
    expect(labels("load")).toEqual([
      ["Trailer A", ["chargers"]],
      ["Not on a truck yet", ["container", "tongs", "napkins", "skirt"]],
    ]);
    // With one truck on the event, everything not placed rides on it; a line
    // placed on a trailer that left the event waits for a new truck.
    expect(
      packView("load", lines, { ...ctx, rigs: [rigs[0]!] }).map((g) => [
        g.label,
        g.lines.length,
      ]),
    ).toEqual([
      ["Box truck 2", 4],
      ["Not on a truck yet", 1],
    ]);
    expect(labels("returns")).toEqual([
      ["Back to the rental company", ["chargers"]],
      ["Ours - back to the warehouse", ["container", "tongs", "skirt"]],
    ]);
    expect(
      comesBack({
        _id: "x",
        description: "Cups",
        requiredQuantity: 1,
        unit: "each",
        category: "disposable",
      }),
    ).toBe(false);
  });
});
