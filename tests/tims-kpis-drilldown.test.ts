// @vitest-environment jsdom
// AC-304 (CF-7.4-01, P leg): each KPI card on Tim's KPIs lists its
// contributing records with per-record values, and the list adds up to the
// card. Playbook parity: the L10 scorecard figures sit above the cards
// (definitions proven in tests/tims-kpi-definitions.test.ts).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seed: Record<string, object[]> = {};

vi.mock("../src/lib/manifest-convex-react", () => {
  const list = (name: string) => () => seed[name] ?? [];
  return {
    useListEvent: list("events"),
    useListEventCloseout: list("closeouts"),
    useListLead: list("leads"),
    useListProposal: list("proposals"),
    useListVenue: list("venues"),
    useListServiceStyle: list("serviceStyles"),
  };
});
// Seed keys by Convex table, for the scoped and paged reads.
const SEED_KEY: Record<string, string> = {
  eventCloseouts: "closeouts",
  revenueAttributions: "attributions",
  leadershipItems: "items",
  scorecardTargets: "targets",
};
vi.mock("../src/lib/financeScopedQueries", async () =>
  (await import("./helpers/financeScopedQueriesMock")).financeScopedMock(
    (table) => seed[SEED_KEY[table] ?? table] as never,
  ),
);

vi.mock("../src/features/facilities/useEventsById", () => ({
  useAllEventReportRows: () => seed.events ?? [],
}));

import { TimsKPIsDashboardPage } from "../src/features/reports/TimsKPIsDashboardPage";

describe("Tim's KPIs drill-down", () => {
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
    seed.events = [
      {
        _id: "e1",
        title: "Smith wedding",
        stage: "completed",
        quotedPrice: 2000,
        expectedHeadcount: 100,
        startsAt: 1,
      },
      {
        _id: "e2",
        title: "Acme lunch",
        stage: "closed_out",
        quotedPrice: 1500,
        expectedHeadcount: 30,
        startsAt: 2,
      },
      {
        _id: "e3",
        title: "Quote only",
        stage: "quote",
        quotedPrice: 9000,
        startsAt: 3,
      },
    ];
    seed.closeouts = [
      {
        _id: "c1",
        eventId: "e1",
        grossProfit: 1400,
        actualIngredientCost: 600,
        budgetedCost: 500,
      },
    ];
    seed.proposals = [{ _id: "pr1", status: "accepted" }];
    seed.leads = [
      // Converted: the client accepted this lead's proposal.
      {
        _id: "l1",
        companyName: "Acme",
        stage: "proposalSent",
        proposalId: "pr1",
      },
      { _id: "l2", givenName: "Ann", familyName: "Lee", stage: "new" },
    ];
    seed.venues = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    for (const key of Object.keys(seed)) delete seed[key];
  });

  it("each KPI card lists its contributing events with per-record values", () => {
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(TimsKPIsDashboardPage)),
      );
    });
    // All-time figures load only when asked for: ask, as a user would.
    const ask = [...container.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").startsWith("Show all-time"),
    );
    if (ask) act(() => ask.click());
    const section = (id: string) =>
      container.querySelector(`[data-testid='${id}']`) as HTMLElement;

    const scorecard = section("tims-scorecard");
    expect(scorecard.textContent).toContain("L10 sales scorecard");
    expect(scorecard.textContent).toContain("Weighted forecast");
    // The open $9,000 quote counts at half in the forecast.
    expect(scorecard.textContent).toContain("$4,500");

    const revenue = section("kpi-records-revenue");
    expect(revenue.querySelector("summary")?.textContent).toContain(
      "2 completed events",
    );
    expect(revenue.querySelector("summary")?.textContent).toContain("$3,500");
    const revenueRows = [...revenue.querySelectorAll("tbody tr")].map(
      (tr) => tr.textContent,
    );
    expect(revenueRows).toHaveLength(2);
    expect(revenueRows.join("|")).toContain("Smith wedding");
    expect(revenueRows.join("|")).toContain("$1,500");
    expect(revenueRows.join("|")).not.toContain("Quote only");
    expect(revenue.querySelector("a")?.getAttribute("href")).toMatch(
      /^\/events\/e[12]$/,
    );

    const closeouts = section("kpi-records-closeouts");
    expect(closeouts.textContent).toContain("Smith wedding");
    expect(closeouts.textContent).toContain("$2,000");
    expect(closeouts.textContent).toContain("$600");
    expect(closeouts.textContent).toContain("$1,400");

    const leads = section("kpi-records-leads");
    expect(leads.querySelector("summary")?.textContent).toContain(
      "2 leads, 1 converted",
    );
    expect(leads.textContent).toContain("Acme");
    expect(leads.textContent).toContain("Ann Lee");
    expect(leads.textContent).toContain("Converted");
  });
});
