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

function visibleCopy(path: string) {
  // Strip // comments the same way the culinary leftover tests do.
  return readFileSync(path, "utf8").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("plain words on leftover pack-item batch match copy", () => {
  it("keeps leftover pack-item batch match copy free of productionBatchId jargon", () => {
    const visible = visibleCopy("src/logistics/pack-list.manifest");
    // Old batch reference wording is gone from the add-item refusal.
    expect(visible).not.toContain(
      "Add item productionBatchId must match the seeded batch reference when provided",
    );
    // The refusal now says which item the work belongs to and what to pick.
    const fresh =
      "This pack item is for a different batch. Pick the batch already on this pack item.";
    expect(visible).toContain(fresh);
    expectPlain(fresh);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Add item productionBatchId must match the seeded batch reference when provided",
    );
    expect(mutations).toContain(fresh);
    // Already-landed pack list item copy stays.
    expect(visible).toContain(
      "This pack item is for a different pack list. Pick the pack list already on this pack item.",
    );
    expect(visible).toContain(
      "This pack item is for a different dish. Pick the dish already on this pack item.",
    );
    expect(visible).toContain("Staff may see pack list items");
    expect(visible).toContain(
      "Kitchen, logistics, event and sales staff and managers may update pack list items",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain("Pack item description is required");
  });
});
