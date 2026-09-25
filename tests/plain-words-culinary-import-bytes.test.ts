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

describe("plain words on leftover culinary import constraint copy", () => {
  it("keeps leftover culinary import source-byte-count copy free of byte jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old source-byte-count refusal is gone.
    expect(visible).not.toContain("Source byte count cannot be negative");
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(
      "This recipe's size can't be negative. Use zero or more.",
    );
    expectPlain("This recipe's size can't be negative. Use zero or more.");
    // The generated mutation file carries the same plain wording, at both
    // upload sites.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Source byte count cannot be negative");
    expect(mutations).toContain(
      "This recipe's size can't be negative. Use zero or more.",
    );
    expect(
      mutations.split("This recipe's size can't be negative. Use zero or more.")
        .length - 1,
    ).toBe(2);
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "This line has no recipe text. Paste the original line from the recipe.",
    );
    expect(visible).toContain(
      "This line has no recipe text. Paste the original line from the recipe.",
    );
    expect(visible).toContain(
      "This line's place in the recipe can't be negative. Use zero or more.",
    );
    // Already-landed copy stays.
    expect(visible).toContain("Paste recipe text before parsing.");
  });
});
