import { describe, expect, it } from "vitest";
import { EventLifecyclePolicy } from "../src/features/events/EventLifecyclePolicy";

describe("EventLifecyclePolicy", () => {
  const policy = new EventLifecyclePolicy();

  it("offers submit from planning and approve from pending_approval", () => {
    expect(
      policy.availableActions("planning").map((a) => a.key),
    ).toContain("submitForApproval");
    expect(
      policy.availableActions("pending_approval").map((a) => a.key),
    ).toEqual(expect.arrayContaining(["approve", "returnToPlanning", "cancel"]));
  });

  it("closes the lifecycle with closeOut after completed", () => {
    expect(policy.availableActions("completed").map((a) => a.key)).toEqual([
      "closeOut",
    ]);
    expect(policy.availableActions("closed_out")).toEqual([]);
  });

  it("humanizes guard failures for the detail screen", () => {
    expect(policy.humanizeCommandError("Guard 0 failed")).toMatch(/stage/i);
  });
});
