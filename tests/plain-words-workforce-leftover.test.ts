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

describe("plain words on leftover workforce schedule-notice and swap recipient copy", () => {
  it("keeps leftover workforce schedule-notice and swap recipient copy free of recipient jargon", () => {
    const visible =
      visibleCopy("src/workforce/shift.manifest") +
      visibleCopy("src/workforce/shift-swap.manifest");
    // Old recipient wording is gone from both refusals.
    expect(visible).not.toContain(
      "Schedule recipient must match the seeded person reference",
    );
    expect(visible).not.toContain(
      "Swap recipient must match the seeded person reference",
    );
    // The refusals now say schedule notice and swap.
    const scheduleNotice =
      "This schedule notice is for a different person. Pick the person already on this schedule notice.";
    const swap =
      "This swap is for a different person. Pick the person already on this swap.";
    expect(visible).toContain(scheduleNotice);
    expect(visible).toContain(swap);
    expectPlain(scheduleNotice);
    expectPlain(swap);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Schedule recipient must match the seeded person reference",
    );
    expect(mutations).not.toContain(
      "Swap recipient must match the seeded person reference",
    );
    expect(mutations).toContain(scheduleNotice);
    expect(mutations).toContain(swap);
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "This swap is for a different shift. Pick the shift already on this swap.",
    );
    expect(visible).toContain(
      "This shift is for a different event. Pick the event already on this shift.",
    );
    expect(visible).toContain(
      "Only the assigned staff member may propose this swap",
    );
    expect(visible).toContain("Choose another staff member for the swap");
    // Already-landed plain words stay.
    expect(visible).toContain(
      "This shift is for a different person. Pick the person already on this shift.",
    );
    expect(visible).toContain(
      "Workforce staff or the linked person may see schedule notices",
    );
  });
});
