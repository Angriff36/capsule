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

describe("plain words on leftover delivery event match copy", () => {
  it("keeps the delivery event match refusal free of eventId jargon", () => {
    const visible = visibleCopy("src/logistics/delivery.manifest");
    // Old event reference wording is gone from the delivery refusal.
    expect(visible).not.toContain(
      "Schedule eventId must match the seeded event reference",
    );
    // The refusal now says which item the work belongs to and what to pick.
    const fresh =
      "This delivery is for a different event. Pick the event already on this delivery.";
    expect(visible).toContain(fresh);
    expectPlain(fresh);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Schedule eventId must match the seeded event reference",
    );
    expect(mutations).toContain(fresh);
    // Already-landed logistics copy stays.
    expect(visible).toContain(
      "Logistics staff and managers may see deliveries",
    );
    expect(visible).toContain(
      "Logistics staff and managers may update deliveries",
    );
  });

  it("keeps leftover delivery pack-list and driver match copy free of packListId jargon", () => {
    const visible = visibleCopy("src/logistics/delivery.manifest");
    // Old reference wording is gone from the pack-list and driver refusals.
    expect(visible).not.toContain(
      "Schedule packListId must match the seeded pack list reference",
    );
    expect(visible).not.toContain(
      "Schedule driverId must match the seeded driver reference when provided",
    );
    // The refusals now say which item the work belongs to and what to pick.
    const freshPackList =
      "This delivery is for a different pack list. Pick the pack list already on this delivery.";
    const freshDriver =
      "This delivery is for a different driver. Leave the driver blank or pick the one already on this delivery.";
    expect(visible).toContain(freshPackList);
    expect(visible).toContain(freshDriver);
    expectPlain(freshPackList);
    expectPlain(freshDriver);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Schedule packListId must match the seeded pack list reference",
    );
    expect(mutations).not.toContain(
      "Schedule driverId must match the seeded driver reference when provided",
    );
    expect(mutations).toContain(freshPackList);
    expect(mutations).toContain(freshDriver);
    // Already-landed event match copy stays.
    expect(visible).toContain(
      "This delivery is for a different event. Pick the event already on this delivery.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain("Give this delivery a destination.");
  });
});
