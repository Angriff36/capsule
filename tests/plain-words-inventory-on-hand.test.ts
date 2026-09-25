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

describe("plain words on leftover stock on-hand copy", () => {
  it("keeps the negative-on-hand refusal free of jargon", () => {
    const manifest = readFileSync("src/inventory/stock.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This item's on-hand amount can't be negative. Use zero or more.";
    // The old jargon refusal is gone from the authored file.
    expect(visible).not.toContain("Quantity on hand cannot be negative");
    // The refusal now speaks in plain catering words (entity + commands share it).
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated summary carries the plain wording.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // This leftover is mixed: the entity-level refusal plus command-level
    // copies on open, adjustQuantity, and applyReceiptCorrection land in
    // generated mutations on InventoryItem.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).toContain(NEW);
    // After this slice the old refusal is gone everywhere generated.
    expect(mutations).not.toContain("Quantity on hand cannot be negative");
    // Already-landed copy on this same file stays.
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
    expect(visible).toContain("Adjustment reason is required");
    expect(visible).toContain("Par level cannot be negative");
    expect(visible).toContain("Reorder threshold cannot be negative");
    expect(visible).toContain("Recount quantity cannot be negative");
  });
});
