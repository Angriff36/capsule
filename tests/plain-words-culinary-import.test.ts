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
  it("keeps leftover culinary import parsed-and-reviewed name constraint copy free of component jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // Old component wording is gone from the parsed/reviewed name refusals.
    expect(visible).not.toContain("Parsed component name is required");
    expect(visible).not.toContain("Reviewed component name is required");
    // The refusals now say recipe.
    expect(visible).toContain("Parsed recipe name is required");
    expect(visible).toContain("Reviewed recipe name is required");
    expectPlain("Parsed recipe name is required");
    expectPlain("Reviewed recipe name is required");
    // The generated mutation file carries the same recipe wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Parsed component name is required");
    expect(mutations).not.toContain("Reviewed component name is required");
    expect(mutations).toContain("Parsed recipe name is required");
    expect(mutations).toContain("Reviewed recipe name is required");
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "Completed imports require a resulting component",
    );
    expect(visible).toContain("Parsed line count cannot be negative");
    expect(visible).toContain(
      "Parsed yield quantity must be positive when present",
    );
    expect(visible).toContain(
      "Reviewed yield quantity must be positive when present",
    );
    // Already-landed recipe leftovers stay.
    expect(visible).toContain("Kitchen staff may see recipe imports");
    expect(visible).toContain("Kitchen staff may update recipe imports");
    expect(visible).toContain("Kitchen staff may change recipe imports");
  });
});
