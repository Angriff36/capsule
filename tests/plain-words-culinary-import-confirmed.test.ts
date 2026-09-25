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
  it("keeps leftover culinary import confirmed-new-line copy free of resolution jargon", () => {
    const manifest = readFileSync(
      "src/culinary/component-import.manifest",
      "utf8",
    );
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // The old resolution-jargon refusal is gone.
    expect(visible).not.toContain(
      "Confirmed new lines link their created ingredient only after resolution",
    );
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(
      "This new line isn't finished yet. Finish it before you attach the ingredient you created.",
    );
    expectPlain(
      "This new line isn't finished yet. Finish it before you attach the ingredient you created.",
    );
    // The generated summary file carries the same plain wording.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).not.toContain(
      "Confirmed new lines link their created ingredient only after resolution",
    );
    expect(summary).toContain(
      "This new line isn't finished yet. Finish it before you attach the ingredient you created.",
    );
    // This leftover is entity-level: mutations.ts need not carry it, but if
    // it ever does, it must carry the plain wording and not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Confirmed new lines link their created ingredient only after resolution",
    );
    // Already-landed copy stays.
    expect(visible).toContain(
      "This line isn't ready to keep that ingredient. Confirm the match first, or attach the ingredient you created.",
    );
    // Already-landed copy stays.
    expect(visible).toContain(
      "This line's place in the recipe can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This line has no recipe text. Paste the original line from the recipe.",
    );
  });
});
