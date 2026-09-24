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

  it("keeps leftover time-off person match copy free of seeded-profile jargon", () => {
    const visible = visibleCopy("src/workforce/availability.manifest");
    // Old seeded-profile wording is gone from the manifest.
    expect(visible).not.toContain(
      "Time-off person must match the seeded staff profile",
    );
    // The refusal now says time-off request.
    const timeOff =
      "This time-off request is for a different person. Pick the person already on this time-off request.";
    expect(visible).toContain(timeOff);
    expectPlain(timeOff);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Time-off person must match the seeded staff profile",
    );
    expect(mutations).toContain(timeOff);
    // Already-landed leftover on the same file stays.
    expect(visible).toContain(
      "This availability is for a different person. Pick the person already on this availability.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "This availability ends before it starts. Pick an end that's later than the start.",
    );
  });

  it("keeps leftover time-off end-after-start copy free of constraint-style jargon", () => {
    const visible = visibleCopy("src/workforce/availability.manifest");
    // Old constraint-style wording is gone from the manifest.
    expect(visible).not.toContain("Time-off end must be after its start");
    // The refusal now says what happened and what to do next.
    const endAfterStart =
      "This time-off request ends before it starts. Pick an end that's later than the start.";
    expect(visible).toContain(endAfterStart);
    expectPlain(endAfterStart);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Time-off end must be after its start");
    expect(mutations).toContain(endAfterStart);
    // Already-landed leftover on the same file stays.
    expect(visible).toContain(
      "This time-off request is for a different person. Pick the person already on this time-off request.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "This availability ends before it starts. Pick an end that's later than the start.",
    );
  });

  it("keeps leftover availability end-after-start copy free of constraint-style jargon", () => {
    const visible = visibleCopy("src/workforce/availability.manifest");
    // Old constraint-style wording is gone from the manifest.
    expect(visible).not.toContain("Availability end must be after its start");
    // The refusal now says what happened and what to do next.
    const endAfterStart =
      "This availability ends before it starts. Pick an end that's later than the start.";
    expect(visible).toContain(endAfterStart);
    expectPlain(endAfterStart);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain("Availability end must be after its start");
    expect(mutations).toContain(endAfterStart);
    // Already-landed leftovers on the same file stay.
    expect(visible).toContain(
      "This availability is for a different person. Pick the person already on this availability.",
    );
    expect(visible).toContain(
      "This time-off request ends before it starts. Pick an end that's later than the start.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "This time-off request is missing a start, an end, or a reason, or it ends before it starts. Pick a start, an end that's later than the start, and tell your manager why you need the time off.",
    );
  });

  it("keeps leftover availability declared start/end copy free of declared-range jargon", () => {
    const visible = visibleCopy("src/workforce/availability.manifest");
    // Old declared-range wording is gone from the manifest and the generated mutation file.
    expect(visible).not.toContain(
      "Declared availability requires a valid start/end range",
    );
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Declared availability requires a valid start/end range",
    );
    // The refusal now says what happened and what to do next.
    const declaredRange =
      "This availability is missing a start or end, or it ends before it starts. Pick a start and an end that's later than the start.";
    expect(visible).toContain(declaredRange);
    expectPlain(declaredRange);
    // The generated context summary carries the same wording.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(declaredRange);
    // Already-landed leftovers on the same file stay.
    expect(visible).toContain(
      "This availability is for a different person. Pick the person already on this availability.",
    );
    expect(visible).toContain(
      "This availability ends before it starts. Pick an end that's later than the start.",
    );
    expect(visible).toContain(
      "This time-off request ends before it starts. Pick an end that's later than the start.",
    );
    // Later leftovers keep their current wording.
    expect(visible).toContain(
      "This time-off request is missing a start, an end, or a reason, or it ends before it starts. Pick a start, an end that's later than the start, and tell your manager why you need the time off.",
    );
  });

  it("keeps leftover submitted time-off range copy free of date-range jargon", () => {
    const visible = visibleCopy("src/workforce/availability.manifest");
    // Old date-range wording is gone from the manifest and the generated mutation file.
    expect(visible).not.toContain(
      "Submitted time off requires a valid date range and reason",
    );
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Submitted time off requires a valid date range and reason",
    );
    // The refusal now says what happened and what to do next.
    const newString =
      "This time-off request is missing a start, an end, or a reason, or it ends before it starts. Pick a start, an end that's later than the start, and tell your manager why you need the time off.";
    expect(visible).toContain(newString);
    expectPlain(newString);
    // The generated context summary carries the same wording.
    const summary = readFileSync("manifest-context-summary.json", "utf8");
    expect(summary).toContain(newString);
    // Already-landed leftovers on the same file stay.
    expect(visible).toContain(
      "This time-off request is for a different person. Pick the person already on this time-off request.",
    );
    expect(visible).toContain(
      "This time-off request ends before it starts. Pick an end that's later than the start.",
    );
    expect(visible).toContain(
      "This availability is missing a start or end, or it ends before it starts. Pick a start and an end that's later than the start.",
    );
    // Later leftovers keep their current wording, pinned from their own files.
    expect(visibleCopy("src/culinary/dish.manifest")).toContain(
      "This subrecipe is for a different dish. Pick the dish already on this subrecipe.",
    );
    expect(visibleCopy("src/quality/allergen-check.manifest")).toContain(
      "Record dishId must match the seeded dish reference when provided",
    );
  });
});
