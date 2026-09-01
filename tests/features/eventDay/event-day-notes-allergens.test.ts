import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  displayEventMenuNotes,
  encodeEventMenuLineFields,
} from "../../../src/features/events/eventMenuLineFields";
import {
  deriveDishAllergens,
  dishAllergenClaim,
} from "../../../src/features/kitchen/dishAllergens";

const eventDaySheet = readFileSync(
  "src/features/eventDay/EventDaySheetSections.tsx",
  "utf8",
);
const briefing = readFileSync(
  "src/features/events/EventAllergenBriefingPage.tsx",
  "utf8",
);
const beoPdf = readFileSync("src/features/events/beoPdf.ts", "utf8");
const menuPdf = readFileSync("src/features/kitchen/menuPdf.ts", "utf8");
const kitchenDash = readFileSync(
  "src/features/kitchen/KitchenDashboardPage.tsx",
  "utf8",
);
const commandDeck = readFileSync(
  "src/features/kitchen/command-deck/KitchenCommandDeckTaskPanel.tsx",
  "utf8",
);
const prepSync = readFileSync(
  "src/features/kitchen/EventPrepTaskSynchronizer.ts",
  "utf8",
);

const SENTINEL = '@capsule.menu {"containerCount":1}';

describe("Event Day leftover: strip @capsule.menu notes", () => {
  it("does not leak the sentinel into display or PDF text", () => {
    expect(displayEventMenuNotes(SENTINEL)).toBe("");
    expect(displayEventMenuNotes(SENTINEL)).not.toMatch(/@capsule\.menu/);
    expect(displayEventMenuNotes(`${SENTINEL}\nKeep extra spicy`)).toBe(
      "Keep extra spicy",
    );
    expect(displayEventMenuNotes("Keep extra spicy\n" + SENTINEL)).toBe(
      "Keep extra spicy",
    );
    const encoded = encodeEventMenuLineFields({
      containerCount: 1,
      notes: "Half pan",
    });
    expect(encoded).toMatch(/@capsule\.menu/);
    expect(displayEventMenuNotes(encoded)).toBe("Half pan");
    expect(displayEventMenuNotes(encoded)).not.toMatch(/@capsule\.menu/);
    expect(displayEventMenuNotes(encoded)).not.toMatch(/containerCount/);
  });

  it("wires Event Day, briefing, and PDFs through displayEventMenuNotes", () => {
    expect(eventDaySheet).toContain("displayEventMenuNotes");
    expect(eventDaySheet).toContain("row.specialInstructions");
    expect(eventDaySheet).not.toMatch(
      /String\(row\.specialInstructions \?\? ""\)\.trim\(\)/,
    );
    expect(briefing).toContain("displayEventMenuNotes");
    expect(briefing).not.toMatch(/\{row\.specialInstructions\}/);
    expect(beoPdf).toContain("displayEventMenuNotes");
    expect(beoPdf).toContain(
      "displayEventMenuNotes(selection.specialInstructions)",
    );
    expect(menuPdf).toContain("displayEventMenuNotes");
    expect(menuPdf).toContain(
      "displayEventMenuNotes(line.selection.specialInstructions)",
    );
    expect(kitchenDash).toContain("displayEventMenuNotes");
    expect(kitchenDash).not.toContain("{String(row.task.specialInstructions)}");
    expect(commandDeck).toContain("displayEventMenuNotes");
    expect(commandDeck).not.toMatch(
      /<p className="kcd-task-note">\{task\.specialInstructions\}<\/p>/,
    );
    expect(prepSync).toContain("displayEventMenuNotes");
  });
});

function tortillasReport(allergens: unknown) {
  return deriveDishAllergens(
    { _id: "dish-tortillas", name: "Flour Tortillas For Tacos" },
    {
      dishIngredients: [
        {
          _id: "di-1",
          dishId: "dish-tortillas",
          ingredientId: "ing-flour",
        },
      ],
      dishComponents: [],
      componentIngredients: [],
      ingredients: [
        {
          _id: "ing-flour",
          name: "Flour Tortillas",
          allergens,
        },
      ],
    },
  );
}

describe("Event Day leftover: empty allergen flags are unverified", () => {
  it("does not claim green No allergens from empty or missing flags", () => {
    for (const flags of [undefined, [], null]) {
      const report = tortillasReport(flags);
      expect(report.lineCount).toBe(1);
      expect(report.unresolvedCount).toBe(0);
      expect(report.unflaggedCount).toBe(1);
      expect(report.codes).toEqual([]);
      expect(dishAllergenClaim(report)).toBe("unverified");
      expect(dishAllergenClaim(report)).not.toBe("clear");
    }
  });

  it("still reports Contains when an ingredient is actually flagged", () => {
    const report = tortillasReport(["wheat"]);
    expect(report.codes).toEqual(["wheat"]);
    expect(report.unflaggedCount).toBe(0);
    expect(dishAllergenClaim(report)).toBe("contains");
  });

  it("keeps Contains but marks incomplete when some lines are unflagged", () => {
    const report = deriveDishAllergens(
      { _id: "dish-tacos" },
      {
        dishIngredients: [
          {
            _id: "di-1",
            dishId: "dish-tacos",
            ingredientId: "ing-flour",
          },
          {
            _id: "di-2",
            dishId: "dish-tacos",
            ingredientId: "ing-crema",
          },
        ],
        dishComponents: [],
        componentIngredients: [],
        ingredients: [
          { _id: "ing-flour", name: "Flour Tortillas", allergens: ["wheat"] },
          { _id: "ing-crema", name: "Sour Cream", allergens: [] },
        ],
      },
    );
    expect(report.codes).toEqual(["wheat"]);
    expect(report.unflaggedCount).toBe(1);
    expect(dishAllergenClaim(report)).toBe("contains");
  });

  it("gates Event Day green No allergens on dishAllergenClaim, not empty flags", () => {
    expect(eventDaySheet).toContain("dishAllergenClaim");
    expect(eventDaySheet).toContain('claim === "clear"');
    expect(eventDaySheet).toContain("evd-allergen-clear");
    expect(eventDaySheet).toContain("unflaggedCount");
    expect(eventDaySheet).not.toMatch(
      /report != null && report\.lineCount > 0 && report\.unresolvedCount === 0/,
    );
    expect(eventDaySheet).toContain(
      "Allergens unverified — ingredient flags not set",
    );
  });
});
