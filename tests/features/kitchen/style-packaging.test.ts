import { describe, expect, it } from "vitest";
import {
  formatMinutes,
  packagingByStyle,
  packagingForEvent,
  serviceStyleForSheetKey,
} from "../../../src/features/kitchen/stylePackaging";
import {
  recipeEquipmentList,
  recipeTimes,
} from "../../../src/features/kitchen/RecipeTimesEquipmentPanel";

const styles = [
  {
    _id: "hot",
    name: "Bring Hot / Buffet – Bring Hot",
    sortOrder: 2,
    status: "active",
  },
  {
    _id: "drop",
    name: "Drop Off",
    code: "DROP",
    sortOrder: 1,
    status: "active",
  },
  { _id: "site", name: "Cook Onsite", sortOrder: 3, status: "active" },
  { _id: "old", name: "Old style", sortOrder: 0, status: "inactive" },
];

const pack = (
  id: string,
  serviceStyleId: string,
  owner: { componentId?: string; dishId?: string },
  deletedAt: number | null = null,
) => ({
  _id: id,
  version: 1,
  serviceStyleId,
  instructions: `pack ${id}`,
  deletedAt,
  ...owner,
});

describe("packaging by service style (PL-RECIPE-SHEET)", () => {
  it("lists one line per active service style in the company's order", () => {
    const rows = [
      pack("a", "hot", { componentId: "sauce" }),
      pack("b", "drop", { componentId: "other" }),
      pack("c", "site", { componentId: "sauce" }, 5),
    ];
    const lines = packagingByStyle(styles, rows, { componentId: "sauce" });
    expect(lines.map((l) => [l.style._id, l.row?._id ?? null])).toEqual([
      ["drop", null],
      ["hot", "a"],
      ["site", null],
    ]);
  });

  it("an event shows only its own service style: dish line first, then its recipes", () => {
    const rows = [
      pack("dish-hot", "hot", { dishId: "pasta" }),
      pack("dish-drop", "drop", { dishId: "pasta" }),
      pack("sauce-hot", "hot", { componentId: "sauce" }),
      pack("sauce-drop", "drop", { componentId: "sauce" }),
    ];
    expect(
      packagingForEvent(rows, "hot", "pasta", ["sauce"]).map((r) => r._id),
    ).toEqual(["dish-hot", "sauce-hot"]);
    expect(packagingForEvent(rows, "site", "pasta", ["sauce"])).toEqual([]);
    expect(packagingForEvent(rows, null, "pasta", ["sauce"])).toEqual([]);
  });

  it("maps the recipe sheet's packaging keys to the company's service styles by name", () => {
    expect(serviceStyleForSheetKey("drop_off", styles)?._id).toBe("drop");
    expect(serviceStyleForSheetKey("bring_hot", styles)?._id).toBe("hot");
    expect(serviceStyleForSheetKey("cook_on_site", styles)?._id).toBe("site");
    expect(serviceStyleForSheetKey("plated", styles)).toBeNull();
  });
});

describe("recipe times and equipment list", () => {
  it("reads hands-on, unattended and total time in plain words", () => {
    expect(recipeTimes({ _id: "r", version: 1 })).toBeNull();
    expect(
      recipeTimes({
        _id: "r",
        version: 1,
        activePrepMinutes: 20,
        passiveCookMinutes: 60,
      }),
    ).toEqual({
      active: "20 minutes",
      passive: "1 hour",
      total: "1 hour 20 minutes",
    });
    expect(formatMinutes(0)).toBe("0 minutes");
    expect(formatMinutes(121)).toBe("2 hours 1 minute");
  });

  it("keeps one recipe's live equipment in written order", () => {
    const row = (
      id: string,
      sortOrder: number,
      componentId = "sauce",
      deletedAt: number | null = null,
    ) => ({
      _id: id,
      version: 1,
      componentId,
      name: id,
      sortOrder,
      deletedAt,
    });
    expect(
      recipeEquipmentList(
        [
          row("blender", 2),
          row("skillet", 1),
          row("gone", 0, "sauce", 9),
          row("pan", 0, "other"),
        ],
        "sauce",
      ).map((r) => r._id),
    ).toEqual(["skillet", "blender"]);
  });
});
