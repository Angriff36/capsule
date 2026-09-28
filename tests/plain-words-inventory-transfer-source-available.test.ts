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

describe("plain words on leftover stock transfer source-available copy", () => {
  it("keeps the too-much-stock refusal free of jargon", () => {
    const manifest = readFileSync("src/inventory/transfer.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const OLD = "Cannot transfer more than the source has on hand";
    const NEW =
      "This transfer can't move more than the send-from stock has on hand. Enter a smaller amount.";
    // The old jargon refusal is gone from the authored transfer file as a
    // quoted message. Pin the quoted form so a later leftover cannot hide it.
    expect(visible).not.toContain(`"${OLD}"`);
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
      "This transfer is taking from a different stock item. Pick the stock item already on this transfer.",
    );
    expect(visible).toContain(
      "This transfer is sending to a different stock item. Pick the stock item already on this transfer.",
    );
    expect(visible).toContain(
      "This transfer's amount has to be more than zero. Enter how much to move.",
    );
    expect(visible).toContain(
      "This saved transfer's amount has to be more than zero. Enter how much was moved.",
    );
    expect(visible).toContain("Inventory staff may see stock transfers");
    expect(visible).toContain("Inventory staff may update stock transfers");
    expect(visible).toContain("Inventory staff may change stock transfers");
    // Already-landed copy on this same file stays.
    expect(visible).toContain(
      "This transfer can't send to the same stock item it takes from. Pick a different send-to item.",
    );
    expect(visible).toContain(
      "This transfer's ingredient doesn't match the send-from stock item. Pick the ingredient that stock item holds.",
    );
  });
});
