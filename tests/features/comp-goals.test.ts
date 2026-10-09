// PL-DASHBOARDS: the owner's Comp Master Status sheet - three performance
// goals (3% / 5% / 8% of base) - counted from Capsule's records.
import { describe, expect, it } from "vitest";
import {
  compGoals,
  weeksWithMeeting,
} from "../../src/features/reports/compGoals";
import { weekStartOf } from "../../src/features/reports/leadershipHistory";

const now = new Date(2026, 9, 15, 12);
const day = 86_400_000;
const at = (y: number, m: number, d = 10) => new Date(y, m, d, 12).getTime();
let n = 0;
const ev = (
  stage: string,
  quotedPrice: number,
  startsAt: number,
  upsellPotential: string | null = null,
) => ({ _id: `e${++n}`, stage, quotedPrice, startsAt, upsellPotential });

const monday = weekStartOf(now).getTime();
const meetingsEachWeek = [1, 2, 3, 4].map((i) => ({
  _id: `m${i}`,
  heldAt: monday - i * 7 * day + day,
  rating: 8,
  recordedAt: monday - i * 7 * day + day,
}));
const rocks = [1, 2, 3].map((i) => ({
  _id: `r${i}`,
  kind: "rock" as const,
  title: `Rock ${i}`,
  status: "open" as const,
  openedAt: at(2026, 6),
  track: "on_track" as const,
  trackSetAt: monday + 60_000,
}));
const target = (metricKey: string, owner: string | null) => ({
  _id: metricKey,
  metricKey,
  target: 1,
  direction: "higher_better" as const,
  ownerPersonId: owner,
  setAt: 1,
});
const fullTargets = [
  target("pipeline_value", "p1"),
  target("event_issue_rate", "p1"),
  target("food_cost_percent", "p1"),
  target("equipment_current", "p1"),
];

const goodEvents = [
  ev("completed", 5000, at(2025, 2)),
  ev("cancelled", 1000, at(2025, 3)),
  ev("completed", 6000, at(2026, 2)),
  ev("quote", 4000, at(2026, 11), "high"),
  ev("approved", 7000, at(2027, 1), "moderate"),
];

describe("comp goals", () => {
  it("counts meetings in the last four full weeks, not this one", () => {
    expect(weeksWithMeeting(meetingsEachWeek, now)).toBe(4);
    expect(weeksWithMeeting(meetingsEachWeek.slice(1), now)).toBe(3);
    expect(
      weeksWithMeeting(
        [{ _id: "x", heldAt: monday + day, recordedAt: 1 }],
        now,
      ),
    ).toBe(0);
  });

  it("puts all 16 points on track when every counted check is met", () => {
    const r = compGoals({
      events: goodEvents,
      targets: fullTargets,
      items: rocks,
      meetings: meetingsEachWeek,
      now,
    });
    expect(r.goals.map((g) => [g.key, g.share, g.status])).toEqual([
      ["sales", 3, "on_track"],
      ["aev", 5, "on_track"],
      ["eos", 8, "on_track"],
    ]);
    expect(r.points).toEqual({ on_track: 16, in_progress: 0, not_started: 0 });
    // Judgment checks are listed but never counted.
    expect(r.goals[1]!.checks.some((c) => c.state === "by_hand")).toBe(true);
  });

  it("shows what is missing when the records fall short", () => {
    const r = compGoals({
      events: [
        ...goodEvents,
        ev("quote", 0, at(2026, 11)),
        ev("cancelled", 3000, at(2026, 4)),
        ev("cancelled", 3000, at(2026, 5)),
      ],
      targets: [target("pipeline_value", null)],
      items: rocks.slice(0, 2),
      meetings: meetingsEachWeek.slice(0, 2),
      now,
    });
    const sales = r.goals[0]!;
    expect(sales.status).toBe("in_progress");
    expect(sales.checks[0]).toMatchObject({ state: "not_yet" });
    expect(sales.checks[0]!.detail).toContain("2 of 3");
    const aev = r.goals[1]!;
    // Close rate this year 1 of 3 decided, under last year's 1 of 2.
    expect(aev.checks[1]!.state).toBe("not_yet");
    // 2 of 3 deals not held yet tagged: under the 80% aim.
    expect(aev.checks[2]!.state).toBe("not_yet");
    expect(aev.status).toBe("in_progress");
    const eos = r.goals[2]!;
    expect(eos.status).toBe("not_started");
    expect(eos.checks[0]!.detail).toContain("1 of 4 areas");
    expect(r.points).toEqual({ on_track: 0, in_progress: 8, not_started: 8 });
  });
});
