import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  TIMS_KPIS,
  timsScorecard,
} from "../src/features/reports/timsScorecard";
import { metricDefinition } from "../src/features/reports/metricDefinitions";

// AC-297 (CF-7.1-04): each Tim's KPI names its recorded definition (the L10
// Sales Scorecard) and the code counts it the way that definition says.
const doc = readFileSync(
  new URL("../docs/reporting/tims-kpi-definitions.md", import.meta.url),
  "utf8",
);

const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
let n = 0;
const ev = (stage: string, quotedPrice: number | null, startsAt: number) => ({
  _id: `e${++n}`,
  stage,
  quotedPrice,
  expectedHeadcount: 40,
  startsAt,
});

const now = new Date(2026, 3, 17, 12);
const events = [
  // Last year to Apr 17: two delivered ($2,000 + $4,000); one after Apr 17.
  ev("completed", 2000, at(2025, 1, 1)),
  ev("closed_out", 4000, at(2025, 3, 10)),
  ev("completed", 9000, at(2025, 5, 1)),
  // This year so far: three delivered ($3,000 + $5,000 + $7,000).
  ev("completed", 3000, at(2026, 0, 10)),
  ev("closed_out", 5000, at(2026, 1, 10)),
  ev("completed", 7000, at(2026, 2, 10)),
  // Confirmed, not delivered yet: $10,000 + $6,000.
  ev("approved", 10000, at(2026, 4, 1)),
  ev("final", 6000, at(2026, 5, 1)),
  // Open quotes: $8,000 quote + $2,000 waiting for approval.
  ev("quote", 8000, at(2026, 6, 1)),
  ev("pending_approval", 2000, at(2026, 7, 1)),
  // Lost this year: $4,000; lost last year does not count.
  ev("cancelled", 4000, at(2026, 2, 1)),
  ev("cancelled", 1000, at(2025, 2, 1)),
];

describe("Tim's KPI definitions", () => {
  it("each KPI names its scorecard card, rule and figure meaning in the doc", () => {
    expect(doc).toContain("L10 Sales Scorecard");
    expect(TIMS_KPIS).toHaveLength(8);
    for (const kpi of TIMS_KPIS) {
      const row = doc
        .split("\n")
        .find((line) => line.includes(`\`${kpi.id}\``));
      expect(row, kpi.id).toBeDefined();
      expect(row).toContain(kpi.scorecardLabel);
      expect(row).toContain(`\`${kpi.metricId}\``);
      expect(kpi.scorecardRule.length).toBeGreaterThan(10);
      expect(metricDefinition(kpi.metricId).measures.length).toBeGreaterThan(
        10,
      );
    }
  });

  it("the code counts each KPI the way the scorecard defines it", () => {
    const s = timsScorecard(events, now);
    // YTD Revenue / Events / AEV: delivered, Jan 1 to today, vs last year.
    expect(s.ytd.revenue).toBe(15000);
    expect(s.ytd.events).toBe(3);
    expect(s.ytd.aev).toBe(5000);
    expect(s.lastYtd.revenue).toBe(6000);
    expect(s.lastYtd.events).toBe(2);
    expect(s.revenueChange).toBe(150);
    expect(s.eventsChange).toBe(50);
    expect(s.aevChange).toBeCloseTo(66.67, 1);
    // Win Rate (YTD): won / (won + lost), events dated this year. The two
    // confirmed events dated after today still count as won this year.
    expect(s.won).toBe(5);
    expect(s.decided).toBe(6);
    expect(s.winRate).toBeCloseTo(83.33, 1);
    // Pipeline: open quotes, waiting for approval included.
    expect(s.pipeline).toMatchObject({ events: 2, revenue: 10000 });
    // Confirmed Value: confirmed, not delivered.
    expect(s.confirmed).toMatchObject({ events: 2, revenue: 16000 });
    // Weighted Forecast: confirmed at 100% + quotes at 50%.
    expect(s.weightedForecast).toBe(16000 + 10000 * 0.5);
    // Lost YTD.
    expect(s.lost).toMatchObject({ events: 1, revenue: 4000 });
  });

  it("says not known, never zero, with no history", () => {
    const s = timsScorecard([], now);
    expect(s.ytd.aev).toBeNull();
    expect(s.winRate).toBeNull();
    expect(s.revenueChange).toBeNull();
    expect(s.weightedForecast).toBe(0);
  });
});
