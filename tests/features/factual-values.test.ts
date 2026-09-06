import { describe, expect, it } from "vitest";
import {
  routeLegLabel,
  routeLegs,
} from "../../src/features/logistics/routePlanner";
import {
  computeVendorPerformance,
  receivedByWeekEndLabel,
} from "../../src/features/inventory/vendorPerformance";
import { eventRevenueEstimate } from "../../src/features/finance/revenueAttributionValues";
import { calculateCommissionMetrics } from "../../src/features/reports/compMasterValues";

describe("factual values", () => {
  it("calculates straight-line route distance and 40 km/h travel time while preserving missing legs", () => {
    const legs = routeLegs(
      ["a", "b", "missing", "c"],
      new Map([
        ["a", { lat: 0, lon: 0 }],
        ["b", { lat: 0, lon: 1 }],
        ["c", { lat: 0, lon: 2 }],
      ]),
    );
    expect(legs[0]).toBeNull();
    expect(legs[1]!.distanceKm).toBeCloseTo(111.19, 1);
    expect(legs[1]!.minutes).toBeCloseTo(166.79, 1);
    expect(legs[2]).toBeNull();
    expect(legs[3]).toBeNull();
    expect(routeLegLabel(legs[1], 1)).toBe(
      "111.2 km straight-line · ~167 min at 40 km/h",
    );
    expect(routeLegLabel(legs[2], 2)).toBe(
      "Missing — no coordinates for this leg",
    );
  });

  it("measures receipt by the inclusive purchasing-week end", () => {
    const end = Date.UTC(2026, 8, 6, 23, 59, 59, 999);
    const result = computeVendorPerformance(
      ["v"],
      [
        {
          _id: "on",
          vendorId: "v",
          status: "received",
          sourceRangeEnd: end,
          receivedAt: end,
        },
        {
          _id: "late",
          vendorId: "v",
          status: "received",
          sourceRangeEnd: end,
          receivedAt: end + 1,
        },
      ],
      [],
      [],
      end + 1,
    );
    expect(result.get("v")?.onTimeRate).toBe(0.5);
    expect(receivedByWeekEndLabel(0.5)).toBe(
      "Received by purchasing-week end 50%",
    );
  });

  it("identifies quote and budget as estimates when prefilling revenue", () => {
    expect(
      eventRevenueEstimate({ quotedPrice: 1200, budgetAmount: 900 }),
    ).toEqual({ amount: 1200, basis: "Quote estimate" });
    expect(eventRevenueEstimate({ quotedPrice: 0, budgetAmount: 900 })).toEqual(
      { amount: 900, basis: "Budget estimate" },
    );
  });

  it("uses only applied sales commission allocations in the selected period without inventing payment state", () => {
    const metrics = calculateCommissionMetrics({
      periodStart: 100,
      periodEnd: 200,
      cancelledEventIds: new Set(["cancelled"]),
      people: [{ _id: "p", givenName: "Ari", familyName: "Lee" }],
      attributions: [
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 125,
          createdAt: 150,
        },
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "venue_commission",
          status: "applied",
          allocatedAmount: 900,
          createdAt: 150,
        },
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "approved",
          allocatedAmount: 400,
          createdAt: 150,
        },
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 300,
          createdAt: 99,
        },
        {
          eventId: "cancelled",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 700,
          createdAt: 150,
        },
      ],
    });
    expect(metrics.totalCommission).toBe(125);
    expect(metrics.salespeople).toEqual([
      { name: "Ari Lee", commission: 125, eventCount: 1 },
    ]);
  });
});
