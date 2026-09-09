import { describe, expect, it } from "vitest";

import path from "node:path";
import {
  canonicalizePackListPath,
  LOGISTICS_SECTIONS,
} from "../src/features/logistics/logisticsRoutes";
import { LogisticsLifecyclePolicy } from "../src/features/logistics/LogisticsLifecyclePolicy";
import {
  PackListStartPackingLifecycle,
  DeliveryConfirmDeliveryLifecycle,
} from "../src/generated/manifest-wiring-bindings";

describe("Logistics routes and lifecycle bindings", () => {
  it("exposes pack list and delivery sections", () => {
    expect(LOGISTICS_SECTIONS.map((section) => section.path)).toEqual([
      "/logistics/packs",
      "/logistics/pack-templates",
      "/logistics/deliveries",
      "/logistics/schedule",
      "/logistics/route",
      "/logistics/fleet",
      "/logistics/maintenance",
    ]);
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

describe("pack-list URL aliases reach /logistics/packs", () => {
  it("rewrites hyphenated and concatenated paths", () => {
    expect(canonicalizePackListPath("/logistics/pack-lists")).toBe(
      "/logistics/packs",
    );
    expect(canonicalizePackListPath("/logistics/packlists")).toBe(
      "/logistics/packs",
    );
    expect(canonicalizePackListPath("/logistics/pack-lists/abc")).toBe(
      "/logistics/packs/abc",
    );
    expect(canonicalizePackListPath("/logistics/packs")).toBe(null);
  });
});
