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

describe("plain words on leftover order-line received quantity copy", () => {
  it("keeps the order-line negative-received-amount refusal free of jargon", () => {
    const manifest = readFileSync("src/procurement/order.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This order line's received amount can't be negative. Use zero or more.";
    // The old jargon refusal is gone from the authored file.
    expect(visible).not.toContain("Received quantity cannot be negative");
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated summary carries the plain wording, not the old one. This
    // leftover is entity-level, so mutations.ts is not expected to carry the
    // new sentence — but it must not carry the old one.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    expect(summary).not.toContain("Received quantity cannot be negative");
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Received quantity cannot be negative");
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This order-to-need link's amount can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This order-to-need link's line isn't on this order. Pick a line from the order already on this link.",
    );
    expect(visible).toContain(
      "This order-to-need link is for a different order. Pick the order already on this link.",
    );
    expect(visible).toContain(
      "This order-to-need link is for a different order line. Pick the order line already on this link.",
    );
    expect(visible).toContain(
      "This order-to-need link is for a different need. Pick the need already on this link.",
    );
    expect(visible).toContain(
      "This weekly order line's amount can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This order line's ordered amount can't be negative. Use zero or more.",
    );
    // Later leftovers on this same file are pinned, not rewritten.
    expect(visible).toContain("Received quantity must be positive");
  });
});
