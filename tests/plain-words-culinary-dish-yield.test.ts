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

describe("plain words on leftover culinary dish yield copy", () => {
  it("keeps leftover culinary attach yield and batch copy free of component jargon", () => {
    const manifest = readFileSync("src/culinary/dish.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW_YIELD = "This subrecipe's yield must be more than zero.";
    const NEW_BATCH =
      "When you enter a batch size on this subrecipe, it must be more than zero.";
    // The old component / multiplier jargon refusals are gone.
    expect(visible).not.toContain("Attached component yield must be positive");
    expect(visible).not.toContain(
      "Attached component batch multiplier must be positive",
    );
    // The refusals now speak in plain catering words.
    expect(visible).toContain(NEW_YIELD);
    expect(visible).toContain(NEW_BATCH);
    expectPlain(NEW_YIELD);
    expectPlain(NEW_BATCH);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Attached component yield must be positive",
    );
    expect(mutations).not.toContain(
      "Attached component batch multiplier must be positive",
    );
    expect(mutations).toContain(NEW_YIELD);
    expect(mutations).toContain(NEW_BATCH);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW_YIELD);
    expect(summary).toContain(NEW_BATCH);
    // Already-landed copy on this same dish file stays.
    expect(visible).toContain(
      "This subrecipe is for a different dish. Pick the dish already on this subrecipe.",
    );
    expect(visible).toContain(
      "This dish task is for a different dish. Pick the dish already on this dish task.",
    );
    expect(visible).toContain("Kitchen staff may see dish recipes");
    // Later leftovers on this file are pinned: they must not change with this one.
    expect(visible).toContain("Dish task name is required");
  });
});
