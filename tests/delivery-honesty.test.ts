import { describe, expect, it } from "vitest";
import { deliveryStatusLabel } from "../src/features/sales/deliveryHonesty";

describe("immediate command and delivery honesty", () => {
  it("labels historical queued and failed messages as not delivered", () => {
    expect(deliveryStatusLabel("queued")).toMatch(/not delivered/i);
    expect(deliveryStatusLabel("failed")).toMatch(/not delivered/i);
    expect(deliveryStatusLabel("sent")).toBeNull();
    expect(deliveryStatusLabel("draft")).toBeNull();
  });
});
