import { describe, expect, it } from "vitest";
import {
  dietaryLine,
  menuCardSections,
} from "../../src/features/facilities/venueMenuCard";

const dish = (id: string, name: string, extra: object = {}) => ({
  _id: id,
  name,
  ...extra,
});

describe("venue menu card (playbook section 06)", () => {
  it("puts the venue-only dishes first, then the chosen menu by course in menu order", () => {
    const sections = menuCardSections({
      venueName: "The Pergola",
      exclusiveDishes: [
        dish("x2", "Pergola Tower"),
        dish("x1", "Garden Crostini"),
        dish("x3", "Old Tower", { status: "retired" }),
      ],
      menuId: "m1",
      menuName: "Spring Dinner",
      menuLines: [
        { menuId: "m1", dishId: "d2", sortOrder: 2, course: "Mains" },
        { menuId: "m1", dishId: "d1", sortOrder: 1, course: "Starters" },
        { menuId: "m1", dishId: "x1", sortOrder: 3, course: "Starters" },
        { menuId: "m1", dishId: "d3", sortOrder: 4 },
        { menuId: "m1", dishId: "d4", sortOrder: 5, deletedAt: 1 },
        { menuId: "m2", dishId: "d5", sortOrder: 0 },
      ],
      menuDishes: [
        dish("d1", "Bruschetta"),
        dish("d2", "Chicken Marsala"),
        dish("d3", "Tiramisu", { course: "Dessert" }),
        dish("d4", "Removed line"),
        dish("x1", "Garden Crostini"),
      ],
    });
    expect(sections.map((s) => [s.title, s.dishes.map((d) => d.name)])).toEqual(
      [
        ["Only at The Pergola", ["Garden Crostini", "Pergola Tower"]],
        ["Starters", ["Bruschetta"]],
        ["Mains", ["Chicken Marsala"]],
        ["Dessert", ["Tiramisu"]],
      ],
    );
  });

  it("shows only the venue dishes when no menu is picked, and nothing when there are none", () => {
    expect(
      menuCardSections({
        venueName: "V",
        exclusiveDishes: [],
        menuLines: [],
        menuDishes: [],
      }),
    ).toEqual([]);
    expect(
      menuCardSections({
        venueName: "V",
        exclusiveDishes: [dish("x", "Only Here")],
        menuLines: [{ menuId: "m", dishId: "d" }],
        menuDishes: [dish("d", "Other")],
      }).map((s) => s.title),
    ).toEqual(["Only at V"]);
  });

  it("writes dietary tags in plain words", () => {
    expect(dietaryLine(["vegan", "gluten_free", " "])).toBe(
      "Vegan · Gluten free",
    );
    expect(dietaryLine(undefined)).toBe("");
  });
});
