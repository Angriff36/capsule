import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PrepTaskClaimLifecycle,
  PrepTaskCompleteLifecycle,
  PrepTaskStartLifecycle,
} from "../src/generated/manifest-wiring-bindings";
import { ProductionLifecyclePolicy } from "../src/features/production/ProductionLifecyclePolicy";

const provenFrom = (lifecycle: readonly { from: string; proven: boolean }[]) =>
  lifecycle.filter((row) => row.proven).map((row) => row.from);

/**
 * Prep Board and Kitchen Dashboard bulk Claim, Start, and Complete share
 * ProductionLifecyclePolicy.prepActions. These are the generated from-statuses.
 */
describe("shared prep claim, start, and complete lifecycle", () => {
  const policy = new ProductionLifecyclePolicy();
  const keys = (status: string) =>
    policy.prepActions(status).map((action) => action.key);

  it("offers each bulk verb only from the generated from-status", () => {
    expect(provenFrom(PrepTaskClaimLifecycle)).toEqual(["pending"]);
    expect(keys("pending")).toContain("claim");
    expect(keys("pending")).not.toContain("start");
    expect(keys("pending")).not.toContain("complete");

    expect(provenFrom(PrepTaskStartLifecycle)).toEqual(["claimed"]);
    expect(keys("claimed")).toContain("start");
    expect(keys("claimed")).not.toContain("claim");
    expect(keys("claimed")).not.toContain("complete");

    expect(provenFrom(PrepTaskCompleteLifecycle)).toEqual(["in_progress"]);
    expect(keys("in_progress")).toContain("complete");
    expect(keys("in_progress")).not.toContain("claim");
    expect(keys("in_progress")).not.toContain("start");
  });

  it("kitchen dashboard bulk eligibility uses that prep board lifecycle", () => {
    const source = readFileSync(
      "src/features/kitchen/KitchenDashboardPage.tsx",
      "utf8",
    );
    expect(source).toContain("new ProductionLifecyclePolicy()");
    expect(source).toContain(".prepActions(");
    expect(source).not.toMatch(
      /if \(label === "claim"\) return status === "pending"/,
    );
    expect(source).not.toMatch(
      /if \(label === "start"\) return status === "claimed"/,
    );
    expect(source).not.toMatch(
      /if \(label === "complete"\) return status === "in_progress"/,
    );
  });
});
