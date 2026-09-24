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

describe("plain words on leftover quality allergen-check dish copy", () => {
  it("keeps the allergen-check dish refusal free of jargon", () => {
    const manifest = readFileSync(
      "src/quality/allergen-check.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This allergen check is for a different dish. Pick the dish already on this allergen check, or leave that blank.";
    // The old seeded-reference jargon refusal is gone.
    expect(visible).not.toContain(
      "Record dishId must match the seeded dish reference when provided",
    );
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Record dishId must match the seeded dish reference when provided",
    );
    expect(mutations).toContain(NEW);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "Event and kitchen staff may see event allergen checks",
    );
    expect(visible).toContain(
      "Event and kitchen staff may update event allergen checks",
    );
    expect(visible).toContain(
      "Event and kitchen staff may change event allergen checks",
    );
    // Later leftovers on this file are pinned: they must not change with this one.
    expect(visible).toContain(
      "Record eventId must match the seeded event reference",
    );
    expect(visible).toContain(
      "Record eventDishId must match the seeded event dish reference when provided",
    );
  });
});
