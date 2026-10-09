// @vitest-environment jsdom
// AC-305 (CF-7.4-02): every Company Scorecard row shows its target, live
// actual, trend, owner and on-track status from seeded rows. The numbers and
// areas are the owner's EOS Company Scorecard (Company_Scorecard.html).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCORECARD_MEASURES,
  SCORECARD_NOT_COUNTED,
  liveTargets,
  scorecardRows,
  scorecardStatus,
  type ScorecardTargetRow,
} from "../../src/features/reports/scorecardMeasures";
import { TREND_LENGTH } from "../../src/features/reports/scorecardPeriods";
import { weekStartOf } from "../../src/features/reports/leadershipHistory";

type Rows = object[];
const seed: Record<string, Rows> = {};

vi.mock("../../src/lib/manifest-convex-react", () => {
  const list = (name: string) => () => seed[name] ?? [];
  return {
    useListEvent: list("events"),
    useListLead: list("leads"),
    useListProposal: list("proposals"),
    useListEventCloseout: list("closeouts"),
    useListPerson: list("people"),
    useListScorecardTarget: list("targets"),
    useListIncident: list("incidents"),
    useListWasteRecord: list("waste"),
    useListEquipmentMaintenanceTask: list("maintenance"),
    useCreateScorecardTarget: () => vi.fn(),
    useScorecardTargetRevise: () => vi.fn(),
    useScorecardTargetRetire: () => vi.fn(),
  };
});

// Seed keys by Convex table, for the scoped and paged reads.
const SEED_KEY: Record<string, string> = {
  eventCloseouts: "closeouts",
  revenueAttributions: "attributions",
  leadershipItems: "items",
  scorecardTargets: "targets",
};
vi.mock("../../src/lib/financeScopedQueries", async () =>
  (await import("../helpers/financeScopedQueriesMock")).financeScopedMock(
    (table) => seed[SEED_KEY[table] ?? table] as never,
  ),
);

vi.mock("../../src/features/facilities/useEventsById", () => ({
  useEventsInRange: () => seed.events ?? [],
}));

import { CompanyScorecardDashboardPage } from "../../src/features/reports/CompanyScorecardDashboardPage";

const now = new Date();
const weekFrom = weekStartOf(now).getTime();
const inThisWeek = (t: number) =>
  t >= weekFrom && t < weekFrom + 7 * 86_400_000;
// A day this month outside this week, so month and week figures stay apart.
const thisMonth = [10, 20]
  .map((day) => new Date(now.getFullYear(), now.getMonth(), day).getTime())
  .find((t) => !inThisWeek(t))!;
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10).getTime();
// In this week (Monday to Sunday) and already past.
const thisWeek = Math.max(weekFrom, now.getTime() - 3_600_000);
// The $4,000 booked this week also counts this month when the week is.
const weekInMonth = new Date(thisWeek).getMonth() === now.getMonth();
const monthRevenue = weekInMonth ? "$7,000" : "$3,000";
const lastMonthRevenue = weekInMonth ? "$500" : "$4,500";
const DAY = 86_400_000;

function target(
  metricKey: string,
  value: number,
  direction: "higher_better" | "lower_better",
  ownerPersonId?: string,
): ScorecardTargetRow {
  return {
    _id: `t-${metricKey}`,
    metricKey,
    target: value,
    direction,
    ownerPersonId,
    setAt: 1,
    version: 1,
  };
}

function seedRows() {
  // Client scores and menu lines (convex/scorecardEventScores.ts): this
  // month 5 and 4 (the cancelled 1 is left out); 7 of 10 lines signature.
  seed.eventScores = [
    {
      startsAt: thisMonth,
      stage: "completed",
      clientRating: 5,
      menuLines: 6,
      signatureLines: 5,
    },
    {
      startsAt: thisMonth,
      stage: "completed",
      clientRating: 4,
      menuLines: 4,
      signatureLines: 2,
    },
    {
      startsAt: thisMonth,
      stage: "cancelled",
      clientRating: 1,
      menuLines: 9,
      signatureLines: 0,
    },
    {
      startsAt: lastMonth,
      stage: "completed",
      clientRating: 3,
      menuLines: 2,
      signatureLines: 0,
    },
  ];
  seed.events = [
    // This month: $3,000 booked, 1 completed, 150 guests.
    {
      _id: "e1",
      stage: "approved",
      quotedPrice: 1000,
      expectedHeadcount: 50,
      startsAt: thisMonth,
    },
    {
      _id: "e2",
      stage: "completed",
      quotedPrice: 2000,
      expectedHeadcount: 100,
      startsAt: thisMonth,
    },
    {
      _id: "e3",
      stage: "cancelled",
      quotedPrice: 9000,
      expectedHeadcount: 9,
      startsAt: thisMonth,
    },
    // Last month: $500 booked.
    {
      _id: "e4",
      stage: "completed",
      quotedPrice: 500,
      expectedHeadcount: 20,
      startsAt: lastMonth,
    },
  ];
  seed.events.push(
    // This week: one booked $4,000, one cancelled, one open quote $8,000.
    { _id: "w1", stage: "approved", quotedPrice: 4000, startsAt: thisWeek },
    { _id: "w2", stage: "cancelled", quotedPrice: 1000, startsAt: thisWeek },
    {
      _id: "q1",
      stage: "quote",
      quotedPrice: 8000,
      startsAt: thisWeek + 30 * DAY,
    },
  );
  seed.closeouts = [
    {
      _id: "c1",
      grossProfit: 700,
      actualIngredientCost: 300,
      finalizedAt: thisWeek,
    },
  ];
  // A problem reported at w1, none at the cancelled w2.
  seed.incidents = [{ _id: "i1", eventId: "w1", status: "open" }];
  // Three shifts due by now: two worked, one no-show; one cancelled.
  seed.shifts = [
    { _id: "s1", startsAt: thisWeek, status: "completed" },
    { _id: "s2", startsAt: thisWeek, status: "started" },
    { _id: "s3", startsAt: thisWeek, status: "no_show" },
    { _id: "s4", startsAt: thisWeek, status: "cancelled" },
  ];
  // Two prep tasks due by now: one done on time, one done late.
  seed.prepTasks = [
    {
      _id: "t1",
      dueAt: thisWeek,
      completedAt: thisWeek - 60_000,
      status: "completed",
    },
    {
      _id: "t2",
      dueAt: thisWeek,
      completedAt: thisWeek + 60_000,
      status: "completed",
    },
  ];
  // $15 of waste against $300 of food cost = 5%.
  seed.waste = [
    {
      _id: "x1",
      recordedAt: thisWeek,
      quantity: 3,
      unitCost: 5,
      status: "recorded",
    },
    {
      _id: "x2",
      recordedAt: thisWeek,
      quantity: 9,
      unitCost: 9,
      status: "voided",
    },
  ];
  // Maintenance: one current, one overdue.
  seed.maintenance = [
    { _id: "m1", nextDueAt: now.getTime() + 10 * DAY },
    { _id: "m2", nextDueAt: now.getTime() - 10 * DAY },
  ];
  seed.proposals = [{ _id: "pr1", status: "accepted" }];
  seed.leads = [
    // Converted: the client accepted this lead's proposal.
    {
      _id: "l1",
      stage: "proposalSent",
      proposalId: "pr1",
      createdAt: thisWeek,
    },
    { _id: "l2", stage: "new", createdAt: thisWeek },
  ];
  seed.people = [
    {
      _id: "p1",
      givenName: "Tim",
      familyName: "Owner",
      status: "active",
      employmentType: "full_time",
      hireDate: 1,
    },
    {
      _id: "p2",
      givenName: "Con",
      familyName: "Tractor",
      status: "active",
      employmentType: "contractor",
      hireDate: 1,
    },
  ];
  seed.targets = [
    target("monthly_revenue", 2500, "higher_better", "p1"),
    target("food_cost_percent", 25, "lower_better", "p1"),
    target("profit_margin", 75, "higher_better"),
    target("lead_conversion", 40, "higher_better", "p1"),
    target("events_completed", 2, "higher_better"),
    target("guests", 100, "higher_better", "p1"),
    target("booked_revenue_week", 15000, "higher_better", "p1"),
    target("prep_on_time", 52, "higher_better"),
  ];
}

describe("company scorecard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    if (!("ResizeObserver" in globalThis)) {
      (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    for (const key of Object.keys(seed)) delete seed[key];
  });

  it("every scorecard row renders target, actual, trend, owner and status from seeded data", () => {
    seedRows();
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(CompanyScorecardDashboardPage),
        ),
      );
    });

    const row = (key: string) => {
      const card = container.querySelector(
        `[data-testid='scorecard-row-${key}']`,
      );
      expect(card, key).not.toBeNull();
      const text = (id: string) =>
        card!.querySelector(`[data-testid='${id}']`)?.textContent ?? "";
      return {
        actual: card!.querySelector("span.text-xl")?.textContent ?? "",
        target: text("scorecard-target"),
        owner: text("scorecard-owner"),
        status: text("scorecard-status"),
        trend: card!.querySelectorAll("[data-testid='scorecard-trend'] li"),
      };
    };

    const targeted = new Set(
      (seed.targets as { metricKey: string }[]).map((t) => t.metricKey),
    );
    for (const measure of SCORECARD_MEASURES) {
      const r = row(measure.key);
      expect(r.trend.length, measure.key).toBe(TREND_LENGTH[measure.period]);
      if (targeted.has(measure.key)) {
        expect(r.target, measure.key).not.toMatch(/^Not set/);
        expect(r.status, measure.key).toMatch(/On track|Caution|Off track/);
      }
    }

    // The owner's four areas, in order, then the older Capsule numbers.
    const areas = [
      ...container.querySelectorAll("[data-testid^='scorecard-area-'] h2"),
    ].map((h) => h.textContent);
    expect(areas).toEqual([
      "Sales",
      "Events / Production",
      "Kitchen / Culinary",
      "Operations / Admin",
      "Other Capsule numbers",
    ]);
    // Numbers Capsule cannot count yet are named, never shown as a figure.
    const notCounted = [
      ...container.querySelectorAll("[data-testid='scorecard-not-counted'] li"),
    ].map((li) => li.textContent ?? "");
    expect(notCounted).toHaveLength(SCORECARD_NOT_COUNTED.length);
    expect(notCounted.join("|")).toContain("Overhead Cost %");
    expect(notCounted.join("|")).not.toContain("Client Satisfaction Score");
    expect(notCounted.join("|")).not.toContain("Menu Adoption Rate");

    // A number with no target shows the scorecard's written one.
    expect(row("pipeline_value").target).toBe("Not set. Scorecard: $75,000+");
    expect(row("pipeline_value").actual).toContain("$8,000");
    // This week: $4,000 booked of $15,000 is off track; close rate 1 of 2.
    expect(row("booked_revenue_week").actual).toContain("$4,000");
    expect(row("booked_revenue_week").status).toBe("Off track");
    expect(row("close_rate").actual).toContain("50");
    expect(row("event_issue_rate").actual).toContain("100");
    expect(row("staff_utilization").actual).toContain("66.7");
    // Prep 1 of 2 on time = 50% against 52%: within 10%, so caution.
    expect(row("prep_on_time").actual).toContain("50");
    expect(row("prep_on_time").status).toBe("Caution");
    expect(row("waste_percent").actual).toContain("5");
    expect(row("equipment_current").actual).toContain("50");
    expect(row("staff_w2_count").actual).toBe("1");
    expect(row("team_retention").actual).toContain("100");

    const revenue = row("monthly_revenue");
    expect(revenue.actual).toContain(monthRevenue);
    expect(revenue.target).toContain("At least");
    expect(revenue.target).toContain("$2,500");
    expect(revenue.owner).toBe("Tim Owner");
    expect(revenue.status).toBe("On track");
    // The trend ends with this month and carries last month's $500.
    const points = [...revenue.trend].map((li) => li.textContent ?? "");
    expect(points[5]).toContain(monthRevenue);
    expect(points[4]).toContain(lastMonthRevenue);

    // Food cost 30% this week against "at most 25%": off track.
    const food = row("food_cost_percent");
    expect(food.target).toContain("At most");
    expect(food.status).toBe("Off track");

    expect(row("profit_margin").owner).toBe("No owner");
    expect(row("events_completed").status).toBe("Off track");
    expect(row("guests").actual).toContain("150");
    expect(row("lead_conversion").status).toBe("On track");

    // Client scores 5 and 4 this month: 4.5 / 5, short of the 4.7 written.
    const satisfaction = row("client_satisfaction");
    expect(satisfaction.actual).toBe("4.5 / 5");
    expect(satisfaction.target).toBe(
      "Not set. Scorecard: 4.7 / 5.0+ (industry benchmark)",
    );
    expect([...satisfaction.trend][4].textContent).toContain("3.0 / 5");
    // 7 of 10 menu lines are signature dishes: 70%.
    expect(row("menu_adoption").actual).toContain("70");
  });

  it("a number with no target says so and offers to set one", () => {
    seedRows();
    seed.targets = [];
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(CompanyScorecardDashboardPage),
        ),
      );
    });
    const card = container.querySelector(
      "[data-testid='scorecard-row-monthly_revenue']",
    )!;
    expect(
      card.querySelector("[data-testid='scorecard-target']")?.textContent,
    ).toBe("Not set");
    expect(
      card.querySelector("[data-testid='scorecard-status']")?.textContent,
    ).toBe("No target set");
    expect(card.textContent).toContain("Set target");
  });
});

describe("scorecard status and targets", () => {
  it("lower-better numbers are on track at or below the target", () => {
    const t = target("food_cost_percent", 30, "lower_better");
    expect(scorecardStatus(30, t)).toBe("on_track");
    expect(scorecardStatus(34, t)).toBe("off_track");
    expect(scorecardStatus(null, t)).toBe("not_known");
    expect(scorecardStatus(10, undefined)).toBe("no_target");
  });

  it("a retired target is not live, and the newest live target wins", () => {
    const live = liveTargets([
      { ...target("guests", 100, "higher_better"), _id: "old", setAt: 1 },
      { ...target("guests", 200, "higher_better"), _id: "new", setAt: 2 },
      { ...target("monthly_revenue", 5, "higher_better"), retiredAt: 3 },
    ]);
    expect(live.get("guests")?._id).toBe("new");
    expect(live.has("monthly_revenue")).toBe(false);
  });

  it("an empty month is not known for percents and zero for sums", () => {
    const rows = scorecardRows(
      { events: [], closeouts: [], leads: [] },
      [],
      now,
    );
    const by = (key: string) => rows.find((r) => r.measure.key === key)!;
    expect(by("monthly_revenue").actual).toBe(0);
    expect(by("food_cost_percent").actual).toBeNull();
    expect(by("food_cost_percent").status).toBe("no_target");
    // Rows not loaded (or not readable) are not known, never zero.
    expect(by("staff_utilization").actual).toBeNull();
    expect(by("staff_w2_count").actual).toBeNull();
  });

  it("a miss within 10% of the target is caution", () => {
    const t = target("guests", 100, "higher_better");
    expect(scorecardStatus(95, t)).toBe("caution");
    expect(scorecardStatus(85, t)).toBe("off_track");
    const low = target("food_cost_percent", 30, "lower_better");
    expect(scorecardStatus(32, low)).toBe("caution");
    expect(scorecardStatus(34, low)).toBe("off_track");
  });
});
