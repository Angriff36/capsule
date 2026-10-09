// @vitest-environment jsdom
// The seven dashboards count only the company's own live rows: seeded rows
// give the figures on screen, empty lists give an explicit empty state, and
// no page carries an iframe or a typed-in dollar figure.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type Rows = Record<string, unknown>[];

const seed: Record<string, Rows> = {};

vi.mock("../../src/lib/manifest-convex-react", () => {
  const list = (name: string) => () => seed[name] ?? [];
  return {
    useListEvent: list("events"),
    useListLead: list("leads"),
    useListProposal: list("proposals"),
    useListClient: list("clients"),
    useListPerson: list("people"),
    useListEventCloseout: list("closeouts"),
    useListVenue: list("venues"),
    useListServiceStyle: list("serviceStyles"),
    useListOccasion: list("occasions"),
    useListReferralSource: list("referralSources"),
    useListRevenueAttribution: list("attributions"),
    useListPrepTask: list("prepTasks"),
    useListPackList: list("packLists"),
    useListScorecardTarget: list("scorecardTargets"),
    useListIncident: list("incidents"),
    useListWasteRecord: list("wasteRecords"),
    useListEquipmentMaintenanceTask: list("equipmentMaintenanceTasks"),
    useListLeadershipItem: list("leadershipItems"),
    useCreateScorecardTarget: () => vi.fn(),
    useScorecardTargetRevise: () => vi.fn(),
    useScorecardTargetRetire: () => vi.fn(),
    useCreateLeadershipItem: () => vi.fn(),
    useLeadershipItemComplete: () => vi.fn(),
    useLeadershipItemDrop: () => vi.fn(),
    useLeadershipItemReopen: () => vi.fn(),
    useLeadershipItemMarkTrack: () => vi.fn(),
    useLeadershipItemSolve: () => vi.fn(),
    useListLeadershipMeeting: list("leadershipMeetings"),
    useCreateLeadershipMeeting: () => vi.fn(),
    useLeadershipMeetingRevise: () => vi.fn(),
  };
});

// Seed keys by Convex table, for the scoped and paged reads.
const SEED_KEY: Record<string, string> = {
  eventCloseouts: "closeouts",
  revenueAttributions: "attributions",
};
vi.mock("../../src/lib/financeScopedQueries", async () =>
  (await import("../helpers/financeScopedQueriesMock")).financeScopedMock(
    (table) => seed[SEED_KEY[table] ?? table],
  ),
);

vi.mock("../../src/features/facilities/useEventsById", () => ({
  useEventsById: () => seed.events ?? [],
  useAllEventReportRows: () => seed.events ?? [],
  useEventsInRange: (window: unknown) =>
    window === "skip" ? undefined : (seed.events ?? []),
}));
vi.mock("../../src/lib/useClientDirectory", () => ({
  useClientDirectory: () => seed.clients ?? [],
}));

import { SalesDashboardPage } from "../../src/features/reports/SalesDashboardPage";
import { TimsKPIsDashboardPage } from "../../src/features/reports/TimsKPIsDashboardPage";
import { CompanyScorecardDashboardPage } from "../../src/features/reports/CompanyScorecardDashboardPage";
import { L10DashboardPage } from "../../src/features/reports/L10DashboardPage";
import { AvgEventValueGrowthDashboardPage } from "../../src/features/reports/AvgEventValueGrowthDashboardPage";
import { CompMasterDashboardPage } from "../../src/features/reports/CompMasterDashboardPage";
import { MangiaDashboardPage } from "../../src/features/reports/MangiaDashboardPage";

const REPORTS_DIR = join(__dirname, "../../src/features/reports");

const now = Date.now();
const startOfToday = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
// Today, this week, this month, and not in the future.
const at = Math.max(startOfToday, now - 60_000);

const EVENT_TITLES: Record<string, string> = {
  e1: "Ashley's wedding",
  e2: "Acme holiday lunch",
  e3: "Baker retirement party",
  e4: "Cole graduation",
};

function event(
  _id: string,
  stage: string,
  quotedPrice: number,
  expectedHeadcount: number,
) {
  return {
    _id,
    title: EVENT_TITLES[_id] ?? "Sample event",
    stage,
    quotedPrice,
    expectedHeadcount,
    startsAt: at,
    createdAt: at,
    updatedAt: at,
    assignedToId: "p1",
    clientId: "c1",
    venueId: "v1",
  };
}

function seedTenantRows() {
  // Two booked events ($1,200 approved + $2,000 completed); a quote and a
  // cancelled event that no booked or completed figure may count.
  seed.events = [
    event("e1", "approved", 1200, 50),
    event("e2", "completed", 2000, 100),
    event("e3", "quote", 5000, 10),
    event("e4", "cancelled", 7000, 20),
  ];
  seed.leads = [
    { _id: "l1", stage: "new", createdAt: at },
    { _id: "l2", stage: "qualified", createdAt: at },
    { _id: "l3", stage: "converted", createdAt: at, updatedAt: at },
  ];
  seed.clients = [{ _id: "c1", name: "Ashley" }];
  seed.people = [{ _id: "p1", givenName: "Bill", familyName: "Cola" }];
  seed.venues = [{ _id: "v1", name: "Hall" }];
  seed.closeouts = [
    {
      _id: "co1",
      eventId: "e2",
      grossProfit: 700,
      actualIngredientCost: 300,
      budgetedCost: 250,
      finalizedAt: at,
    },
  ];
  seed.attributions = [
    {
      _id: "a1",
      eventId: "e1",
      salespersonId: "p1",
      attributionType: "sales_commission",
      status: "applied",
      allocatedAmount: 96,
      appliedAt: at,
    },
    {
      _id: "a2",
      eventId: "e4",
      salespersonId: "p1",
      attributionType: "sales_commission",
      status: "applied",
      allocatedAmount: 210,
      appliedAt: at,
    },
    {
      _id: "a3",
      eventId: "e2",
      salespersonId: "p1",
      attributionType: "sales_commission",
      status: "pending",
      allocatedAmount: 60,
      appliedAt: at,
    },
  ];
}

function clearSeed() {
  for (const key of Object.keys(seed)) delete seed[key];
}

interface PageCase {
  name: string;
  file: string;
  Page: ComponentType;
  card: string;
  expected: string;
}

const PAGES: PageCase[] = [
  {
    name: "Sales",
    file: "SalesDashboardPage.tsx",
    Page: SalesDashboardPage,
    card: "Booked Revenue",
    expected: "$3,200",
  },
  {
    name: "Tim's KPIs",
    file: "TimsKPIsDashboardPage.tsx",
    Page: TimsKPIsDashboardPage,
    card: "Total Revenue",
    expected: "$2,000",
  },
  {
    name: "Company Scorecard",
    file: "CompanyScorecardDashboardPage.tsx",
    Page: CompanyScorecardDashboardPage,
    card: "Monthly Revenue",
    expected: "$3,200",
  },
  {
    name: "L10",
    file: "L10DashboardPage.tsx",
    Page: L10DashboardPage,
    card: "Monthly Revenue",
    expected: "$3,200",
  },
  {
    name: "Avg Event Value",
    file: "AvgEventValueGrowthDashboardPage.tsx",
    Page: AvgEventValueGrowthDashboardPage,
    card: "Avg Event Value",
    expected: "$2,000",
  },
  {
    name: "Comp Master",
    file: "CompMasterDashboardPage.tsx",
    Page: CompMasterDashboardPage,
    card: "Applied Commission",
    expected: "$96",
  },
  {
    name: "Mangia",
    file: "MangiaDashboardPage.tsx",
    Page: MangiaDashboardPage,
    card: "Revenue won this year",
    expected: "$3,200",
  },
];

describe("dashboards read live tenant rows", () => {
  let container: HTMLDivElement;
  let root: Root;
  // The seeded render of every page, kept for the AC-370 rendered review.
  const rendered: string[] = [];

  afterAll(() => {
    if (existsSync(".artifacts/llm-review")) {
      writeFileSync(
        ".artifacts/llm-review/AC-370-rendered.html",
        rendered.join("\n"),
      );
    }
  });

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
    clearSeed();
  });

  function render(Page: ComponentType) {
    act(() => {
      root.render(createElement(MemoryRouter, null, createElement(Page)));
    });
    // All-time figures load only when asked for: ask, as a user would.
    const ask = [...container.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").startsWith("Show all-time"),
    );
    if (ask) act(() => ask.click());
  }

  function cardValue(title: string): string {
    const heading = [...container.querySelectorAll("h3")].find(
      (h3) => (h3.textContent ?? "").trim() === title,
    );
    expect(heading, `card "${title}"`).toBeDefined();
    const value = heading!.parentElement!.querySelector(
      "span.font-mono, span.text-xl",
    );
    return value?.textContent ?? "";
  }

  const empty = () =>
    container.querySelector("[data-testid='dashboard-empty']");

  for (const page of PAGES) {
    it(`each dashboard computes its figures from seeded tenant rows and renders an explicit empty state (${page.name})`, () => {
      // (a) seeded rows give the figure, and no empty state.
      seedTenantRows();
      render(page.Page);
      expect(cardValue(page.card)).toContain(page.expected);
      expect(empty()).toBeNull();
      rendered.push(
        `<section data-page="${page.name}">${container.innerHTML}</section>`,
      );
      act(() => root.unmount());

      // (b) every list loaded and empty: the explicit empty state.
      clearSeed();
      root = createRoot(container);
      render(page.Page);
      expect(empty()).not.toBeNull();

      // (c) no iframe and no typed-in dollar figure in the page source.
      const source = readFileSync(join(REPORTS_DIR, page.file), "utf8");
      expect(source).not.toMatch(/<iframe/);
      expect(source).not.toMatch(/\$\d/);
    });
  }
});
