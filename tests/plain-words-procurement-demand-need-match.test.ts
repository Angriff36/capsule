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

describe("plain words on leftover procurement demand-link need-match copy", () => {
  it("keeps the different-need refusal free of jargon", () => {
    const manifest = readFileSync("src/procurement/order.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This order-to-need link is for a different need. Pick the need already on this link.";
    // The old jargon refusal is gone.
    expect(visible).not.toContain(
      "Demand link ingredientDemandId must match the seeded demand reference",
    );
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Demand link ingredientDemandId must match the seeded demand reference",
    );
    expect(mutations).toContain(NEW);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This order-to-need link is for a different order line. Pick the order line already on this link.",
    );
    expect(visible).toContain(
      "This order-to-need link's amount can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This order-to-need link needs a reason before you retire it. Write why you're taking it off.",
    );
    expect(visible).toContain(
      "Procurement and managers may see order demand links",
    );
    // The different-order refusal is already landed in plain words.
    expect(visible).toContain(
      "This order-to-need link is for a different order. Pick the order already on this link.",
    );
    // The order-owns-the-line refusal is already landed in plain words.
    expect(visible).toContain(
      "This order-to-need link's line isn't on this order. Pick a line from the order already on this link.",
    );
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain(
      "This order-to-need link's amount has to be more than zero. Enter how much this line covers.",
    );
    expect(visible).toContain("Received quantity cannot be negative");
  });
});
