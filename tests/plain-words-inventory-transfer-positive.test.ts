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

describe("plain words on leftover stock transfer-amount-positive copy", () => {
  it("keeps the zero-transfer refusal free of jargon", () => {
    const manifest = readFileSync("src/inventory/stock.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This item's transfer amount has to be more than zero. Enter how much to move.";
    // The old jargon refusal is gone from the authored stock-item file.
    expect(visible).not.toContain("Transfer quantity must be positive");
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated summary carries the plain wording.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // This leftover is command-level: regen copies the command messages into
    // generated mutations on stock transfer out and transfer in.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).toContain(NEW);
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This item's on-hand amount can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This item's cost per unit can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This item's received amount has to be more than zero. Enter how much arrived.",
    );
    expect(visible).toContain(
      "Inventory staff and managers may see stock items",
    );
    expect(visible).toContain(
      "Inventory staff and managers may update stock items",
    );
    expect(visible).toContain("Say why this count changed.");
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain("Say why you're changing this item's amount.");
    expect(visible).toContain(
      "This item's par level can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This item's reorder threshold can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This item's counted amount can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This item can't send more than it has on hand. Enter a smaller amount.",
    );
  });
});
