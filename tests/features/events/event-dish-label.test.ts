import { describe, expect, it } from "vitest";
import { eventDishLabel } from "../../../src/features/events/eventDishLabel";

describe("eventDishLabel", () => {
  it("prints the booked snapshot, not a later catalog rename", () => {
    expect(
      eventDishLabel({
        dishId: "dish-a",
        dishName: "Garden salad",
        liveName: "Garden salad RENAMED",
        dishesLoading: false,
      }),
    ).toBe("Garden salad");
  });

  it("keeps the snapshot while the dish list is still loading", () => {
    expect(
      eventDishLabel({
        dishId: "dish-a",
        dishName: "Garden salad",
        liveName: "",
        dishesLoading: true,
      }),
    ).toBe("Garden salad");
  });

  it("falls back to the live dish name for legacy lines with no snapshot", () => {
    expect(
      eventDishLabel({
        dishId: "dish-a",
        dishName: null,
        liveName: "Garden salad",
        dishesLoading: false,
      }),
    ).toBe("Garden salad");
  });

  it("says loading while a set dish id has no row yet and no snapshot", () => {
    expect(
      eventDishLabel({
        dishId: "dish-a",
        dishName: null,
        liveName: "",
        dishesLoading: true,
      }),
    ).toBe("Loading dish…");
  });

  it("says unavailable when a set dish id has no row and loading is done", () => {
    expect(
      eventDishLabel({
        dishId: "dish-a",
        dishName: null,
        liveName: "",
        dishesLoading: false,
      }),
    ).toBe("Dish unavailable");
  });

  it("says Unknown dish only when the line has no dish id at all", () => {
    expect(
      eventDishLabel({
        dishId: null,
        dishName: null,
        liveName: "",
        dishesLoading: false,
      }),
    ).toBe("Unknown dish");
  });
});
