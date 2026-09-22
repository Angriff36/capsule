import { describe, expect, it } from "vitest";
import { EventLifecyclePolicy } from "../src/features/events/EventLifecyclePolicy";

describe("EventLifecyclePolicy", () => {
  const policy = new EventLifecyclePolicy();

  it("humanizes guard failures for the detail screen", () => {
    const detail = policy.humanizeCommandError("Guard 0 failed");
    expect(detail).toBe(
      "One of this action's requirements was not met. No changes were saved.",
    );
    expect(detail).not.toMatch(/lifecycle|refresh|stage/i);
  });

  it("keeps sales_lock editable and executing not", () => {
    expect(policy.isEditableStage("sales_lock")).toBe(true);
    expect(policy.isEditableStage("executing")).toBe(false);
  });

  it("allows headcount changes on sales_lock", () => {
    expect(policy.canChangeHeadcount("sales_lock")).toBe(true);
  });
});
