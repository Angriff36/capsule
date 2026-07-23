import { describe, expect, it } from "vitest";
import { SupplyLifecyclePolicy } from "../src/features/inventory/SupplyLifecyclePolicy";

describe("SupplyLifecyclePolicy", () => {
  const policy = new SupplyLifecyclePolicy();

  it("derives demand and reservation offers from generated metadata", () => {
    expect(policy.demandActions("calculated").map((item) => item.key)).toEqual([
      "supersede",
    ]);
    expect(policy.demandActions("confirmed").map((item) => item.key)).toEqual([
      "fulfill",
      "supersede",
    ]);
    expect(policy.reservationActions("active").map((item) => item.key)).toEqual(
      ["consume", "release"],
    );
  });

  it("derives purchase-need offers from generated metadata", () => {
    expect(policy.purchaseNeedActions("open").map((item) => item.key)).toEqual([
      "markOrdered",
      "cancel",
    ]);
    expect(
      policy.purchaseNeedActions("ordered").map((item) => item.key),
    ).toEqual(["markFulfilled", "cancel"]);
  });

  it("derives order offers from generated metadata", () => {
    // submitForApproval/approve appeared with the order-approval flow;
    // offers derive from target-status legality and approve is guard-
    // filtered at runtime (requires pending_approval).
    expect(policy.orderActions("draft").map((item) => item.key)).toEqual([
      "submit",
      "submitForApproval",
      "approve",
      "cancel",
    ]);
    expect(policy.orderActions("submitted").map((item) => item.key)).toEqual([
      "confirm",
      "cancel",
    ]);
    expect(policy.orderActions("confirmed").map((item) => item.key)).toEqual([
      "markPartiallyReceived",
      "markReceived",
      "cancel",
    ]);
  });
});
