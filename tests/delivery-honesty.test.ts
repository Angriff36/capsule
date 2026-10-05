import { describe, expect, it } from "vitest";
import { deliveryStatusLabel } from "../src/features/sales/deliveryHonesty";
import { formatTppPercent } from "../src/features/reports/tpp/formatters";
import { SupplyLifecyclePolicy } from "../src/features/inventory/SupplyLifecyclePolicy";

describe("immediate command and delivery honesty", () => {
  it("labels historical queued and failed messages as not delivered", () => {
    expect(deliveryStatusLabel("queued")).toMatch(/not delivered/i);
    expect(deliveryStatusLabel("failed")).toMatch(/not delivered/i);
    expect(deliveryStatusLabel("sent")).toBeNull();
    expect(deliveryStatusLabel("draft")).toBeNull();
  });

  // AC-054 sweep 2026-10-03 (docs/product/no-fake-data-ledger.md).
  it("shows 'Not known yet' instead of a made-up 0%", () => {
    expect(formatTppPercent(null)).toBe("Not known yet");
    expect(formatTppPercent(Number.NaN)).toBe("Not known yet");
    expect(formatTppPercent(25)).toMatch(/^25.*%$/);
  });

  it("never says Capsule sent a vendor order it does not send", () => {
    const policy = new SupplyLifecyclePolicy();
    const labels = ["draft", "pending_approval", "submitted"].flatMap(
      (status) => policy.orderActions(status).map((action) => action.label),
    );
    expect(labels).toContain("Mark sent");
    for (const label of labels) {
      expect(label).not.toMatch(/^submit$|sent to the vendor|& submit/i);
    }
  });
});
