import { describe, expect, it } from "vitest";
import { equipmentShelfMark } from "../../../src/features/facilities/equipmentShelfMark";

describe("equipment shelf mark (kit magnets)", () => {
  it("is green when nothing is open, red when it needs service, yellow when something is missing", () => {
    const issues = [
      { equipmentId: "rustic-kit", kind: "cleaning", status: "open" },
      { equipmentId: "chafer-kit", kind: "cleaning", status: "open" },
      { equipmentId: "chafer-kit", kind: "missing", status: "open" },
      { equipmentId: "bar-kit", kind: "missing", status: "resolved" },
      {
        equipmentId: "pizza-kit",
        kind: "repair",
        status: "open",
        deletedAt: 1,
      },
    ];
    expect(equipmentShelfMark("rustic-kit", issues)).toEqual({
      label: "Needs service",
      tone: "chip-tone-danger",
    });
    expect(equipmentShelfMark("chafer-kit", issues).label).toBe(
      "Missing items",
    );
    expect(equipmentShelfMark("bar-kit", issues).label).toBe("Ready");
    expect(equipmentShelfMark("pizza-kit", issues).label).toBe("Ready");
  });
});
