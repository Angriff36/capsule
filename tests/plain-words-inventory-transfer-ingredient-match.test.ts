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

describe("plain words on leftover stock transfer ingredient-match copy", () => {
  it("keeps the wrong-ingredient refusal free of jargon", () => {
    const manifest = readFileSync("src/inventory/transfer.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const OLD = "Transfer ingredientId must match the source stock ingredient";
    const NEW =
      "This transfer's ingredient doesn't match the send-from stock item. Pick the ingredient that stock item holds.";
    // The old jargon refusal is gone from the authored transfer file.
    expect(visible).not.toContain(OLD);
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated summary carries the plain wording, not the old one.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    expect(summary).not.toContain(OLD);
    // This leftover is command-level: regen copies the command message into
    // generated mutations on stock transfer record and createViaRecord.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).toContain(NEW);
    expect(mutations).not.toContain(OLD);
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This transfer can't send to the same stock item it takes from. Pick a different send-to item.",
    );
    expect(visible).toContain(
      "This transfer can't move more than the send-from stock has on hand. Enter a smaller amount.",
    );
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain(
      "This transfer's source and destination have to hold the same ingredient.",
    );
  });
});
