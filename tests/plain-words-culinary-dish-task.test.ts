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

describe("plain words on leftover culinary dish task copy", () => {
  it("keeps leftover culinary dish-task match copy free of dishId jargon", () => {
    const manifest = readFileSync("src/culinary/dish.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This dish task is for a different dish. Pick the dish already on this dish task.";
    // The old dishId / seeded-reference jargon refusal is gone.
    expect(visible).not.toContain(
      "Dish task dishId must match the seeded Dish reference",
    );
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Dish task dishId must match the seeded Dish reference",
    );
    expect(mutations).toContain(NEW);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // Already-landed copy on this same dish file stays.
    expect(visible).toContain(
      "This subrecipe is for a different dish. Pick the dish already on this subrecipe.",
    );
    // Later leftovers on this file are pinned: they must not change with this one.
    expect(visible).toContain("Attached component yield must be positive");
    expect(visible).toContain(
      "Attached component batch multiplier must be positive",
    );
    expect(visible).toContain("Dish task name is required");
  });
});
