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

describe("plain words on leftover event ingredient servings copy", () => {
  it("keeps the event ingredient negative-servings refusal free of jargon", () => {
    const manifest = readFileSync(
      "src/procurement/event-purchasing.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This event's serving count can't be negative. Use zero or more.";
    // The old jargon refusal is gone from the authored file.
    expect(visible).not.toContain("Contribution servings cannot be negative");
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // Regen carries the plain wording into the generated copies.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).toContain(NEW);
    expect(mutations).not.toContain("Contribution servings cannot be negative");
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain("Approval threshold cannot be negative");
  });
});
