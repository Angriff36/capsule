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

describe("plain words on leftover workforce and payroll event/shift match copy", () => {
  it("keeps leftover workforce and payroll event and shift match copy free of eventId jargon", () => {
    const visible =
      visibleCopy("src/workforce/assignment.manifest") +
      visibleCopy("src/workforce/shift.manifest") +
      visibleCopy("src/workforce/shift-swap.manifest") +
      visibleCopy("src/finance/payroll-input.manifest");
    // Old event/shift reference wording is gone from all five refusals.
    for (const old of [
      "Assign eventId must match the seeded event reference",
      "Schedule eventId must match the seeded event reference when provided",
      "Swap shift must match the seeded shift reference",
      "Prepare eventId must match the seeded event reference when both are set",
      "Prepare shiftId must match the seeded shift reference when both are set",
    ]) {
      expect(visible).not.toContain(old);
    }
    // The refusals now say which record the work belongs to and what to pick.
    for (const fresh of [
      "This assignment is for a different event. Pick the event already on this assignment.",
      "This shift is for a different event. Pick the event already on this shift.",
      "This swap is for a different shift. Pick the shift already on this swap.",
      "This payroll input is for a different event. Pick the event already on this payroll input.",
      "This payroll input is for a different shift. Pick the shift already on this payroll input.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    for (const old of [
      "Assign eventId must match the seeded event reference",
      "Schedule eventId must match the seeded event reference when provided",
      "Swap shift must match the seeded shift reference",
      "Prepare eventId must match the seeded event reference when both are set",
      "Prepare shiftId must match the seeded shift reference when both are set",
    ]) {
      expect(mutations).not.toContain(old);
    }
    for (const fresh of [
      "This assignment is for a different event. Pick the event already on this assignment.",
      "This shift is for a different event. Pick the event already on this shift.",
      "This swap is for a different shift. Pick the shift already on this swap.",
      "This payroll input is for a different event. Pick the event already on this payroll input.",
      "This payroll input is for a different shift. Pick the shift already on this payroll input.",
    ]) {
      expect(mutations).toContain(fresh);
    }
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "The recipient needs a matching active certification",
    );
    expect(visible).toContain(
      "Recipient certification must match the shift requirement",
    );
    expect(visible).toContain(
      "Payroll period end must be at or after period start",
    );
    // The time-off person leftover keeps its wording, pinned from the generated file.
    expect(mutations).toContain(
      "Time-off person must match the seeded staff profile",
    );
    // Already-landed person match copy stays.
    expect(visible).toContain(
      "This assignment is for a different person. Pick the person already on this assignment.",
    );
    expect(visible).toContain(
      "This shift is for a different person. Pick the person already on this shift.",
    );
    expect(visible).toContain(
      "This swap is for a different person. Pick the person already on this swap.",
    );
    expect(visible).toContain(
      "This payroll input is for a different person. Pick the person already on this payroll input.",
    );
  });
});
