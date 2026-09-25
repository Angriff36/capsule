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

describe("plain words on leftover stock transfer saved-amount copy", () => {
  it("keeps the saved-transfer zero-amount refusal free of jargon", () => {
    const manifest = readFileSync("src/inventory/transfer.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This saved transfer's amount has to be more than zero. Enter how much was moved.";
    // The old jargon refusal is gone from the authored file.
    expect(visible).not.toContain(
      "Transfer quantity must be positive once recorded",
    );
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated summary carries the plain wording, not the old one. This
    // leftover is entity-level, so mutations.ts is not expected to carry the
    // new sentence — but it must not carry the old one.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    expect(summary).not.toContain(
      "Transfer quantity must be positive once recorded",
    );
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Transfer quantity must be positive once recorded",
    );
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This transfer's amount has to be more than zero. Enter how much to move.",
    );
    expect(visible).toContain("Inventory staff may see stock transfers");
    expect(visible).toContain("Inventory staff may update stock transfers");
    expect(visible).toContain("Inventory staff may change stock transfers");
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain(
      "This transfer is taking from a different stock item. Pick the stock item already on this transfer.",
    );
    expect(visible).toContain(
      "This transfer is sending to a different stock item. Pick the stock item already on this transfer.",
    );
    expect(visible).toContain(
      "This transfer can't move more than the send-from stock has on hand. Enter a smaller amount.",
    );
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain("Source and destination stock lines must differ");
  });
});
