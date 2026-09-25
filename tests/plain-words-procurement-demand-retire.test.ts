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

describe("plain words on leftover procurement demand-link retire copy", () => {
  it("keeps the order-to-need retire-reason refusal free of jargon", () => {
    const manifest = readFileSync("src/procurement/order.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This order-to-need link needs a reason before you retire it. Write why you're taking it off.";
    // The old jargon refusal is gone.
    expect(visible).not.toContain("Demand link retirement reason is required");
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Demand link retirement reason is required",
    );
    expect(mutations).toContain(NEW);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "Procurement and managers may see order demand links",
    );
    expect(visible).toContain(
      "Procurement and managers may update order demand links",
    );
    expect(visible).toContain(
      "Procurement and managers may change order demand links",
    );
  });
});
