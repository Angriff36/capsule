import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LOGISTICS_SECTIONS } from "../src/features/logistics/logisticsRoutes";
import { LogisticsLifecyclePolicy } from "../src/features/logistics/LogisticsLifecyclePolicy";
import {
  PackListStartPackingLifecycle,
  DeliveryConfirmDeliveryLifecycle,
} from "../src/generated/manifest-wiring-bindings";

describe("Logistics routes and lifecycle bindings", () => {
  it("exposes pack list and delivery sections", () => {
    expect(LOGISTICS_SECTIONS.map((section) => section.path)).toEqual([
      "/logistics/packs",
      "/logistics/deliveries",
      "/logistics/schedule",
      "/logistics/fleet",
    ]);
  });

  it("wires logistics routes in App.tsx", () => {
    const app = readFileSync(
      path.join(process.cwd(), "src/app/App.tsx"),
      "utf8",
    );
    expect(app).toContain('path="/logistics/packs"');
    expect(app).toContain('path="/logistics/packs/:id"');
    expect(app).toContain('path="/logistics/deliveries"');
    expect(app).toContain("PackListsPage");
    expect(app).toContain("PackListDetailPage");
    expect(app).toContain("DeliveriesPage");
  });

  it("derives pack and delivery actions from generated lifecycle metadata", () => {
    const policy = new LogisticsLifecyclePolicy();
    expect(policy.packListActions("draft").map((a) => a.key)).toEqual(
      expect.arrayContaining(["startPacking", "cancel"]),
    );
    expect(policy.packListActions("loaded").map((a) => a.key)).toEqual(
      expect.arrayContaining(["dispatch", "cancel"]),
    );
    expect(policy.deliveryActions("scheduled").map((a) => a.key)).toEqual(
      expect.arrayContaining(["startTransit", "markFailed", "cancel"]),
    );
    expect(policy.deliveryActions("in_transit").map((a) => a.key)).toEqual(
      expect.arrayContaining(["confirmDelivery", "markFailed", "cancel"]),
    );
    expect(PackListStartPackingLifecycle[0]?.from).toBe("draft");
    expect(DeliveryConfirmDeliveryLifecycle[0]?.from).toBe("in_transit");
  });
});
