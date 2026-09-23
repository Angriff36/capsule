import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on kitchen screens", () => {
  it("keeps kitchen nutrition copy free of record jargon", () => {
    const menuDetail = readFileSync(
      "src/features/kitchen/MenuDetailPage.tsx",
      "utf8",
    );
    const nutritionPanel = readFileSync(
      "src/features/kitchen/ComponentNutritionPanel.tsx",
      "utf8",
    );

    expect(menuDetail).not.toContain("with recorded nutrition");
    expect(nutritionPanel).not.toContain("without recorded nutrition");

    expect(menuDetail).toContain("with nutrition on file");
    expect(nutritionPanel).toContain(
      "Ingredients without nutrition on file are",
    );

    expectPlain("with nutrition on file");
    expectPlain("Ingredients without nutrition on file are");
  });
});
