// AC-307 (CF-7.4-04): the salesperson, service style, occasion and venue
// breakdowns each split the completed events exactly once, and each split's
// revenue adds back up to the trend total.
import { describe, expect, it } from "vitest";
import { breakdownBy } from "../../src/features/reports/avgEventBreakdowns";
import { isCompletedEvent } from "../../src/features/reports/dashboardRecordSets";

interface Ev {
  _id: string;
  stage: string;
  quotedPrice: number;
  expectedHeadcount?: number;
  assignedToId?: string;
  serviceStyleId?: string;
  occasionId?: string;
  venueId?: string;
}

const events: Ev[] = [
  {
    _id: "a",
    stage: "completed",
    quotedPrice: 1000,
    expectedHeadcount: 50,
    assignedToId: "p1",
    serviceStyleId: "buffet",
    occasionId: "wedding",
    venueId: "v1",
  },
  {
    _id: "b",
    stage: "closed_out",
    quotedPrice: 3000,
    expectedHeadcount: 100,
    assignedToId: "p2",
    serviceStyleId: "plated",
    occasionId: "wedding",
    venueId: "v2",
  },
  {
    _id: "c",
    stage: "completed",
    quotedPrice: 500,
    assignedToId: "p1",
    serviceStyleId: "buffet",
  },
  {
    _id: "d",
    stage: "approved",
    quotedPrice: 9000,
    assignedToId: "p1",
    venueId: "v1",
  },
];

const completed = events.filter(isCompletedEvent);
const trendTotal = completed.reduce((s, e) => s + e.quotedPrice, 0);

const facts: Array<[string, (e: Ev) => string | undefined]> = [
  ["salesperson", (e) => e.assignedToId],
  ["service style", (e) => e.serviceStyleId],
  ["occasion", (e) => e.occasionId],
  ["venue", (e) => e.venueId],
];

describe("average event value breakdowns", () => {
  for (const [name, keyOf] of facts) {
    it(`the four breakdowns partition completed events exactly and values sum to the trend total (${name})`, () => {
      const rows = breakdownBy(
        completed,
        keyOf,
        (key) => `Name ${key}`,
        `No ${name}`,
      );
      expect(rows.reduce((s, r) => s + r.eventCount, 0)).toBe(completed.length);
      expect(rows.reduce((s, r) => s + r.totalRevenue, 0)).toBe(trendTotal);
      for (const row of rows) {
        expect(row.avgEventValue).toBeCloseTo(
          row.totalRevenue / row.eventCount,
        );
      }
    });
  }

  it("an event with no value for the fact goes to a named group, never a raw id", () => {
    const rows = breakdownBy(
      completed,
      (e) => e.occasionId,
      (k) => `Name ${k}`,
      "No occasion",
    );
    expect(rows.map((r) => r.label).sort()).toEqual([
      "Name wedding",
      "No occasion",
    ]);
    const none = rows.find((r) => r.label === "No occasion")!;
    expect(none.eventCount).toBe(1);
    expect(none.revenuePerHead).toBeNull();
  });

  it("revenue per guest counts only events that have a guest count", () => {
    const [p1] = breakdownBy(
      completed.filter((e) => e.assignedToId === "p1"),
      (e) => e.assignedToId,
      () => "P1",
      "No salesperson",
    );
    expect(p1.totalRevenue).toBe(1500);
    expect(p1.revenuePerHead).toBe(20);
  });
});
