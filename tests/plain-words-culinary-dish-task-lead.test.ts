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

describe("plain words on leftover culinary dish task lead copy", () => {
  it("keeps the dish task lead-time refusal free of jargon", () => {
    const manifest = readFileSync("src/culinary/dish.manifest", "utf8");
    // Strip // comments the same way the culinary leftover tests do.
    const visible = manifest.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const NEW =
      "This dish task's lead time can't be negative. Use zero or more days.";
    // The old jargon refusal is gone.
    expect(visible).not.toContain("Lead time cannot be negative");
    // The refusal now speaks in plain catering words.
    expect(visible).toContain(NEW);
    expectPlain(NEW);
    // The generated copies carry the plain wording, not the old one.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Lead time cannot be negative");
    expect(mutations).toContain(NEW);
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(NEW);
    // Already-landed copy on this same dish file stays.
    expect(visible).toContain(
      "This dish task has no name. Type a name for it.",
    );
    expect(visible).toContain(
      "When you enter a quantity on this dish task, it must be more than zero.",
    );
    expect(visible).toContain(
      "This dish task's place in the list can't be negative. Use zero or more.",
    );
    expect(visible).toContain(
      "This dish task is for a different dish. Pick the dish already on this dish task.",
    );
    // Already-landed sequence copy on this same dish file stays.
    expect(visible).toContain(
      "This dish task can't follow itself. Pick a different dish task to come after, or leave that blank.",
    );
    // Later leftovers on this file are pinned: they must not change with this one.
    expect(visible).toContain("Dish task retirement reason is required");
  });
});
