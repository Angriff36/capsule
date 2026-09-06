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
          createdAt: 50,
          appliedAt: 150,
        },
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "venue_commission",
          status: "applied",
          allocatedAmount: 900,
          appliedAt: 150,
        },
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "approved",
          allocatedAmount: 400,
          appliedAt: 150,
        },
        {
          eventId: "e",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 300,
          createdAt: 150,
          appliedAt: 99,
        },
        {
          eventId: "cancelled",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 700,
          appliedAt: 150,
        },
      ],
    });
    expect(metrics.totalCommission).toBe(125);
    expect(metrics.salespeople).toEqual([{ name: "Ari Lee", commission: 125 }]);
  });

  it("uses appliedAt across month boundaries and excludes undated records from a period", () => {
    const base = {
      cancelledEventIds: new Set<string>(),
      people: [{ _id: "p", givenName: "Ari", familyName: "Lee" }],
      attributions: [
        {
          eventId: "created-before",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 20,
          createdAt: 90,
          appliedAt: 150,
        },
        {
          eventId: "created-during",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 30,
          createdAt: 150,
          appliedAt: 210,
        },
        {
          eventId: "legacy",
          salespersonId: "p",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 40,
          createdAt: 150,
        },
        {
          eventId: "missing-person",
          salespersonId: "deleted-person",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 10,
          appliedAt: 150,
        },
        {
          eventId: "another-missing-person",
          salespersonId: "another-deleted-person",
          attributionType: "sales_commission",
          status: "applied",
          allocatedAmount: 15,
          appliedAt: 150,
        },
      ],
    };
    const monthly = calculateCommissionMetrics({
      ...base,
      periodStart: 100,
      periodEnd: 200,
    });
    expect(monthly.totalCommission).toBe(45);
    expect(monthly.salespeople).toContainEqual({
      name: "Unknown salesperson",
      commission: 15,
    });
    expect(
      monthly.salespeople.filter(({ name }) => name === "Unknown salesperson"),
    ).toHaveLength(2);
    expect(
      calculateCommissionMetrics({
        ...base,
        periodStart: Number.NEGATIVE_INFINITY,
        periodEnd: Number.POSITIVE_INFINITY,
      }).totalCommission,
    ).toBe(115);
  });
});
