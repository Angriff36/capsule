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
      "Payroll period end must be at or after period start",
    );
    // The time-off person leftover keeps its wording, pinned from the generated file.
    expect(mutations).toContain(
      "This time-off request is for a different person. Pick the person already on this time-off request.",
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

  it("keeps leftover shift-swap certification copy free of recipient jargon", () => {
    const visible = visibleCopy("src/workforce/shift-swap.manifest");
    // Old recipient wording is gone from the three certification refusals.
    for (const old of [
      "The recipient needs a matching active certification",
      "Recipient certification must match the shift requirement",
      "Recipient certification must remain valid through the shift",
    ]) {
      expect(visible).not.toContain(old);
    }
    // The refusals now say what is wrong and what to pick next.
    for (const fresh of [
      "This person needs a current matching certification for the shift. Pick someone who already has it.",
      "This person's certification doesn't match what the shift needs. Pick someone with the same certification.",
      "This person's certification expires before the shift ends. Pick someone whose certification lasts through the shift.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    for (const old of [
      "The recipient needs a matching active certification",
      "Recipient certification must match the shift requirement",
      "Recipient certification must remain valid through the shift",
    ]) {
      expect(mutations).not.toContain(old);
    }
    for (const fresh of [
      "This person needs a current matching certification for the shift. Pick someone who already has it.",
      "This person's certification doesn't match what the shift needs. Pick someone with the same certification.",
      "This person's certification expires before the shift ends. Pick someone whose certification lasts through the shift.",
    ]) {
      expect(mutations).toContain(fresh);
    }
    // Already-landed copy stays.
    expect(visible).toContain(
      "This swap is for a different person. Pick the person already on this swap.",
    );
    expect(visible).toContain(
      "This swap is for a different shift. Pick the shift already on this swap.",
    );
    expect(visible).toContain(
      "The shift certification requirement changed after this request was proposed",
    );
    // The training refusals are already in plain words.
    for (const fresh of [
      "This person needs the training this shift type requires. Pick someone who already has it.",
      "This training is for a different person. Pick a training that belongs to this person.",
      "This person's training doesn't match what the shift type needs. Pick someone with the same training.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover shift-swap replacement-certification copy free of recipient jargon", () => {
    const visible = visibleCopy("src/workforce/shift-swap.manifest");
    // Old recipient wording is gone from the replacement-certification refusals.
    expect(visible).not.toContain(
      "Replacement certification must belong to the recipient",
    );
    // The refusal now says what is wrong and what to pick next.
    const fresh =
      "This certification is for a different person. Pick a certification that belongs to this person.";
    expect(visible).toContain(fresh);
    expectPlain(fresh);
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    expect(mutations).not.toContain(
      "Replacement certification must belong to the recipient",
    );
    expect(mutations).toContain(fresh);
    // Already-landed certification and person copy stays.
    expect(visible).toContain(
      "This person needs a current matching certification for the shift. Pick someone who already has it.",
    );
    expect(visible).toContain(
      "This person's certification doesn't match what the shift needs. Pick someone with the same certification.",
    );
    expect(visible).toContain(
      "This swap is for a different person. Pick the person already on this swap.",
    );
    // The training refusals are already in plain words.
    for (const fresh of [
      "This person needs the training this shift type requires. Pick someone who already has it.",
      "This training is for a different person. Pick a training that belongs to this person.",
      "This person's training doesn't match what the shift type needs. Pick someone with the same training.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });

  it("keeps leftover shift-swap training copy free of recipient jargon", () => {
    const visible = visibleCopy("src/workforce/shift-swap.manifest");
    // Old recipient wording is gone from the three training refusals.
    for (const old of [
      "The recipient needs the training required by this shift type",
      "Training completion must belong to the recipient",
      "Recipient training must match the shift type requirement",
    ]) {
      expect(visible).not.toContain(old);
    }
    // The refusals now say what is wrong and what to pick next.
    for (const fresh of [
      "This person needs the training this shift type requires. Pick someone who already has it.",
      "This training is for a different person. Pick a training that belongs to this person.",
      "This person's training doesn't match what the shift type needs. Pick someone with the same training.",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
    // The generated mutation file carries the same wording.
    const mutations = readFileSync("convex/mutations.ts", "utf8");
    for (const old of [
      "The recipient needs the training required by this shift type",
      "Training completion must belong to the recipient",
      "Recipient training must match the shift type requirement",
    ]) {
      expect(mutations).not.toContain(old);
    }
    for (const fresh of [
      "This person needs the training this shift type requires. Pick someone who already has it.",
      "This training is for a different person. Pick a training that belongs to this person.",
      "This person's training doesn't match what the shift type needs. Pick someone with the same training.",
    ]) {
      expect(mutations).toContain(fresh);
    }
    // Already-landed copy stays.
    expect(visible).toContain(
      "This certification is for a different person. Pick a certification that belongs to this person.",
    );
    expect(visible).toContain(
      "This person needs a current matching certification for the shift. Pick someone who already has it.",
    );
    expect(visible).toContain(
      "This swap is for a different person. Pick the person already on this swap.",
    );
    // Later leftovers keep their current wording.
    expect(mutations).toContain(
      "This time-off request is for a different person. Pick the person already on this time-off request.",
    );
    expect(mutations).toContain(
      "This line has no recipe text. Paste the original line from the recipe.",
    );
  });
});
