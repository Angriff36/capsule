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

describe("plain words on leftover quality allergen-check flag-consistency copy", () => {
  it("keeps the pass/flagged allergen refusal free of jargon", () => {
    const allergenManifest = readFileSync(
      "src/quality/allergen-check.manifest",
      "utf8",
    );
    // Strip // comments the same way the quality leftover tests do.
    const visible = allergenManifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This allergen check can't pass with allergens listed. If you flagged it, name at least one allergen.";
    const OLD =
      "Pass requires no flagged allergens; flagged requires at least one";
    // The old pass/flagged refusal is gone from the file.
    expect(visible).not.toContain(OLD);
    // The refusal now speaks in plain catering words (both sites).
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(OLD);
    expect(mutations).toContain(NEW);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).not.toContain(OLD);
    expect(summary).toContain(NEW);
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This allergen check is already saved. You can't change it. Start a new check if something changed.",
    );
    expect(visible).toContain(
      "This allergen check is for a different event. Pick the event already on this allergen check.",
    );
    expect(visible).toContain(
      "This allergen check is for a different dish. Pick the dish already on this allergen check, or leave that blank.",
    );
    expect(visible).toContain(
      "This allergen check is for a different event dish. Pick the event dish already on this allergen check, or leave that blank.",
    );
    // Later leftovers are pinned: they must not change with this one.
    const orderManifest = readFileSync(
      "src/procurement/order.manifest",
      "utf8",
    );
    const orderVisible = orderManifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    expect(orderVisible).toContain(
      "Demand link contribution cannot be negative",
    );
  });
});
