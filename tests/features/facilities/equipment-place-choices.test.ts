/**
 * Goodshuffle dossier "place is text": the equipment storage place and the
 * Move box offer the places already in use, and another spelling of a known
 * place saves as that place's own name.
 */
import { describe, expect, it } from "vitest";
import {
  equipmentPlaceChoices,
  matchEquipmentPlace,
} from "../../../src/features/facilities/EquipmentForm";

describe("equipment places", () => {
  it("offers catalog places first-spelled once, plus storage places", () => {
    const places = equipmentPlaceChoices(
      [
        { homeLocation: "Warehouse  Shelf A", currentLocation: "Trailer 2" },
        { homeLocation: "warehouse shelf a", currentLocation: null },
        { homeLocation: null, currentLocation: " " },
      ],
      ["Walk-in", "trailer 2"],
    );
    expect(places).toEqual(["Trailer 2", "Walk-in", "Warehouse Shelf A"]);
  });

  it("saves another spelling as the known place and keeps new words", () => {
    const places = ["Trailer 2", "Warehouse Shelf A"];
    expect(matchEquipmentPlace("  warehouse   shelf a ", places)).toBe(
      "Warehouse Shelf A",
    );
    expect(matchEquipmentPlace("Garage", places)).toBe("Garage");
    expect(matchEquipmentPlace("   ", places)).toBe("");
  });
});
