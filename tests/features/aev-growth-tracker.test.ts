// PL-DASHBOARDS: the owner's Average Event Value Growth Strategy asks for a
// monthly tracker against the 10% goal and a close-rate watch that warns
// after two months under last year's close rate.
import { describe, expect, it } from "vitest";
import { aevGrowthTracker } from "../../src/features/reports/aevGrowthTracker";

const at = (year: number, month: number, day = 10) =>
  new Date(year, month, day, 12).getTime();
let n = 0;
const ev = (stage: string, quotedPrice: number, startsAt: number) => ({
  _id: `e${++n}`,
  stage,
  quotedPrice,
  startsAt,
});

const now = new Date(2026, 9, 15, 12);
const events = [
  // Last year: delivered $4,000 + $6,000 (average $5,000), one lost.
  ev("completed", 4000, at(2025, 0)),
  ev("closed_out", 6000, at(2025, 5)),
  ev("cancelled", 3000, at(2025, 6)),
  // This year.
  ev("completed", 6000, at(2026, 0)),
  ev("approved", 7000, at(2026, 7)),
  ev("cancelled", 2000, at(2026, 7)),
  ev("cancelled", 2500, at(2026, 7, 20)),
  ev("cancelled", 1000, at(2026, 8)),
  ev("quote", 9000, at(2026, 8)),
];

describe("average event value growth tracker", () => {
  it("sets the goal 10% above last year's delivered average", () => {
    const t = aevGrowthTracker(events, now);
    expect(t.baselineAev).toBe(5000);
    expect(t.goal).toBeCloseTo(5500);
    expect(t.baselineCloseRate).toBeCloseTo((2 / 3) * 100);
  });

  it("gives one row per month to date, against the goal and last year", () => {
    const t = aevGrowthTracker(events, now);
    expect(t.months.map((m) => m.month)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    const jan = t.months[0]!;
    expect(jan.won).toMatchObject({ events: 1, revenue: 6000, aev: 6000 });
    expect(jan.vsGoal).toBeCloseTo(((6000 - 5500) / 5500) * 100);
    expect(jan.vsLastYear).toBeCloseTo(50);
    const feb = t.months[1]!;
    expect(feb.won.events).toBe(0);
    expect(feb.vsGoal).toBeNull();
    expect(feb.closeRate).toBeNull();
    expect(feb.belowBaseline).toBeNull();
    // A booked event counts as won before it happens.
    expect(t.months[7]!.won).toMatchObject({ events: 1, revenue: 7000 });
  });

  it("warns when the two finished months are both under last year's close rate", () => {
    const t = aevGrowthTracker(events, now);
    const aug = t.months[7]!;
    expect(aug).toMatchObject({ wonDeals: 1, lostDeals: 2 });
    expect(aug.closeRate).toBeCloseTo(100 / 3);
    expect(aug.belowBaseline).toBe(true);
    // An open quote is not decided yet.
    expect(t.months[8]).toMatchObject({ wonDeals: 0, lostDeals: 1 });
    expect(t.closeRateWarning).toBe(true);
  });

  it("does not warn after one bad month, or with no history", () => {
    const oneBad = events.filter((e) => e.startsAt < at(2026, 8, 1));
    expect(aevGrowthTracker(oneBad, now).closeRateWarning).toBe(false);
    const fresh = aevGrowthTracker(
      [ev("cancelled", 100, at(2026, 7)), ev("cancelled", 100, at(2026, 8))],
      now,
    );
    expect(fresh.goal).toBeNull();
    expect(fresh.baselineCloseRate).toBeNull();
    expect(fresh.closeRateWarning).toBe(false);
  });
});
