import { describe, expect, it } from "vitest";
import {
  ALLERGEN_MATRIX_PATH,
  eventDetailMenuPath,
  KITCHEN_SECTIONS,
} from "../../../src/features/kitchen/kitchenRoutes";

describe("kitchenRoutes nav cleanup", () => {
  it("keeps the prep board, plan and yield in one menu and drops allergen/event-menu keys", () => {
    const keys = KITCHEN_SECTIONS.map((section) => section.key);
    expect(keys).toContain("prep");
    expect(keys).toContain("plan");
    expect(keys).toContain("yield");
    expect(keys).not.toContain("allergens");
    expect(keys).not.toContain("event-menu");
  });

  it("keeps allergen matrix as a deep-link path outside kitchen tabs", () => {
    expect(ALLERGEN_MATRIX_PATH).toBe("/kitchen/allergen-matrix");
    expect(eventDetailMenuPath("e1")).toBe("/events/e1?tab=menu");
  });
});
