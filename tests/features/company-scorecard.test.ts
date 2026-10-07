// @vitest-environment jsdom
// AC-305 (CF-7.4-02): every Company Scorecard row shows its target, live
// actual, six-month trend, owner and on-track status from seeded rows.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SCORECARD_MEASURES,
  liveTargets,
  scorecardRows,
  scorecardStatus,
  type ScorecardTargetRow,
} from "../../src/features/reports/scorecardMeasures";

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
    useCreateScorecardTarget: () => vi.fn(),
    useScorecardTargetRevise: () => vi.fn(),
    useScorecardTargetRetire: () => vi.fn(),
  };
});

vi.mock("../../src/features/facilities/useEventsById", () => ({
  useEventsInRange: () => seed.events ?? [],
}));

import { CompanyScorecardDashboardPage } from "../../src/features/reports/CompanyScorecardDashboardPage";

const now = new Date();
const thisMonth = new Date(now.getFullYear(), now.getMonth(), 10).getTime();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10).getTime();

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
  seed.closeouts = [
    {
      _id: "c1",
      grossProfit: 700,
      actualIngredientCost: 300,
      finalizedAt: thisMonth,
    },
  ];
  seed.proposals = [{ _id: "pr1", status: "accepted" }];
  seed.leads = [
    // Converted: the client accepted this lead's proposal.
    {
      _id: "l1",
      stage: "proposalSent",
      proposalId: "pr1",
      createdAt: thisMonth,
    },
    { _id: "l2", stage: "new", createdAt: thisMonth },
  ];
  seed.people = [
    { _id: "p1", givenName: "Tim", familyName: "Owner", status: "active" },
  ];
  seed.targets = [
    target("monthly_revenue", 2500, "higher_better", "p1"),
    target("food_cost_percent", 25, "lower_better", "p1"),
    target("profit_margin", 75, "higher_better"),
    target("lead_conversion", 40, "higher_better", "p1"),
    target("events_completed", 2, "higher_better"),
    target("guests", 100, "higher_better", "p1"),
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

    for (const measure of SCORECARD_MEASURES) {
      const r = row(measure.key);
      expect(r.trend.length, measure.key).toBe(6);
      expect(r.target, measure.key).not.toBe("Not set");
      expect(r.status, measure.key).toMatch(/On track|Off track/);
    }

    const revenue = row("monthly_revenue");
    expect(revenue.actual).toContain("$3,000");
    expect(revenue.target).toContain("At least");
    expect(revenue.target).toContain("$2,500");
    expect(revenue.owner).toBe("Tim Owner");
    expect(revenue.status).toBe("On track");
    // The trend ends with this month and carries last month's $500.
    const points = [...revenue.trend].map((li) => li.textContent ?? "");
    expect(points[5]).toContain("$3,000");
    expect(points[4]).toContain("$500");

    // Food cost 30% against "at most 25%": off track.
    const food = row("food_cost_percent");
    expect(food.target).toContain("At most");
    expect(food.status).toBe("Off track");

    expect(row("profit_margin").owner).toBe("No owner");
    expect(row("events_completed").status).toBe("Off track");
    expect(row("guests").actual).toContain("150");
    expect(row("lead_conversion").status).toBe("On track");
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
    expect(scorecardStatus(31, t)).toBe("off_track");
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
    const [revenue, food] = scorecardRows(
      { events: [], closeouts: [], leads: [] },
      [],
      now,
    );
    expect(revenue.actual).toBe(0);
    expect(food.actual).toBeNull();
    expect(food.status).toBe("no_target");
  });
});
