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

describe("plain words on leftover pack-item pack-list match copy", () => {
  it("keeps leftover pack-item pack-list match copy free of packListId jargon", () => {
    const visible = visibleCopy("src/logistics/pack-list.manifest");
    // Old pack list reference wording is gone from the add-item refusal.
    expect(visible).not.toContain(
      "Add item packListId must match the seeded pack list reference",
    );
    // The refusal now says which item the work belongs to and what to pick.
    const fresh =
      "This pack item is for a different pack list. Pick the pack list already on this pack item.";
    expect(visible).toContain(fresh);
    expectPlain(fresh);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Add item packListId must match the seeded pack list reference",
    );
    expect(mutations).toContain(fresh);
    // Already-landed pack list item copy stays.
    expect(visible).toContain("Staff may see pack list items");
    expect(visible).toContain(
      "Kitchen, logistics, event and sales staff and managers may update pack list items",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "Add item dishId must match the seeded dish reference when provided",
    );
    expect(visible).toContain(
      "Add item productionBatchId must match the seeded batch reference when provided",
    );
    expect(visible).toContain("Pack item description is required");
  });
});
