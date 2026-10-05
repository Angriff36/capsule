// @vitest-environment jsdom
// AC-306 (CF-7.4-03): the L10 page shows the scorecard, priorities (rocks),
// issues, to-dos and meeting-period history from live rows.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  weekStartOf,
  weeklyHistory,
} from "../../src/features/reports/leadershipHistory";

type Rows = Record<string, unknown>[];
const seed: Record<string, Rows> = {};
const complete = vi.fn();

vi.mock("../../src/lib/manifest-convex-react", () => {
  const list = (name: string) => () => seed[name] ?? [];
  return {
    useListEvent: list("events"),
    useListLead: list("leads"),
    useListEventCloseout: list("closeouts"),
    useListPerson: list("people"),
    useListScorecardTarget: list("targets"),
    useListLeadershipItem: list("items"),
    useCreateLeadershipItem: () => vi.fn(),
    useLeadershipItemComplete: () => complete,
    useLeadershipItemDrop: () => vi.fn(),
    useLeadershipItemReopen: () => vi.fn(),
  };
});

vi.mock("../../src/features/facilities/useEventsById", () => ({
  useEventsInRange: () => seed.events ?? [],
}));

import { L10DashboardPage } from "../../src/features/reports/L10DashboardPage";

const now = new Date();
const monday = weekStartOf(now);
const thisWeek = monday.getTime();
const lastWeek = new Date(
  monday.getFullYear(),
  monday.getMonth(),
  monday.getDate() - 7,
).getTime();

function item(
  _id: string,
  kind: string,
  title: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  return {
    _id,
    kind,
    title,
    status,
    openedAt: lastWeek,
    ownerPersonId: "p1",
    version: 1,
    ...extra,
  };
}

function seedRows() {
  seed.events = [
    {
      _id: "e1",
      stage: "completed",
      quotedPrice: 2000,
      expectedHeadcount: 80,
      startsAt: thisWeek,
    },
  ];
  seed.leads = [{ _id: "l1", stage: "new", createdAt: lastWeek }];
  seed.closeouts = [];
  seed.people = [
    { _id: "p1", givenName: "Tim", familyName: "Owner", status: "active" },
  ];
  seed.targets = [
    {
      _id: "t1",
      metricKey: "monthly_revenue",
      target: 1000,
      direction: "higher_better",
      ownerPersonId: "p1",
      setAt: 1,
    },
  ];
  seed.items = [
    item("r1", "rock", "Open the second kitchen", "open"),
    item("i1", "issue", "Late rentals", "open"),
    item("t1", "todo", "Call the linen vendor", "open", { dueAt: lastWeek }),
    item("t2", "todo", "Send the menu", "done", { closedAt: thisWeek }),
    item("x1", "todo", "Deleted one", "open", { deletedAt: thisWeek }),
  ];
}

describe("L10 dashboard", () => {
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
    complete.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    for (const key of Object.keys(seed)) delete seed[key];
  });

  it("L10 renders scorecard, rocks, issues, action items and period history from seeded rows", () => {
    seedRows();
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(L10DashboardPage)),
      );
    });
    const table = (id: string) =>
      container.querySelector(`[data-testid='${id}']`)?.textContent ?? "";

    // Scorecard: target, actual, owner and status for each number.
    const scorecard = table("l10-scorecard");
    expect(scorecard).toContain("Monthly Revenue");
    expect(scorecard).toContain("$1,000");
    expect(scorecard).toContain("Tim Owner");
    expect(scorecard).toMatch(/On track|Off track/);
    expect(scorecard).toContain("No target set");

    expect(table("leadership-rock")).toContain("Open the second kitchen");
    expect(table("leadership-issue")).toContain("Late rentals");
    const todos = table("leadership-todo");
    expect(todos).toContain("Call the linen vendor");
    expect(todos).toContain("(late)");
    expect(todos).toContain("Send the menu");
    expect(todos).toContain("Done");
    expect(todos).not.toContain("Deleted one");

    // History: newest week first; this week has the done to-do and the
    // completed event, last week the four items added and the new lead.
    const rows = container.querySelectorAll(
      "[data-testid='l10-history'] tbody tr",
    );
    expect(rows.length).toBe(8);
    const cells = (i: number) =>
      [...rows[i].querySelectorAll("td")].map((td) => td.textContent ?? "");
    expect(cells(0).slice(1)).toEqual(["0", "1", "0", "1", "$2,000", "0"]);
    expect(cells(1).slice(1)).toEqual(["4", "0", "0", "0", "$0", "1"]);
  });

  it("marking a to-do done sends the complete step for that row", async () => {
    seedRows();
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(L10DashboardPage)),
      );
    });
    const todoTable = container.querySelector(
      "[data-testid='leadership-todo']",
    )!;
    const done = [...todoTable.querySelectorAll("button")].find(
      (b) => b.textContent === "Done",
    )!;
    await act(async () => {
      done.click();
    });
    expect(complete).toHaveBeenCalledWith({ docId: "t1", version: 1 });
  });

  it("with no rows, every section says it is empty instead of showing numbers", () => {
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(L10DashboardPage)),
      );
    });
    expect(container.textContent).toContain("No open priorities.");
    expect(container.textContent).toContain("No open issues.");
    expect(container.textContent).toContain("No open to-dos.");
    expect(
      container.querySelector("[data-testid='dashboard-empty']"),
    ).not.toBeNull();
  });
});

describe("weekly history", () => {
  it("counts each item once, in the week it was added and the week it closed", () => {
    const history = weeklyHistory(
      {
        items: [
          {
            _id: "a",
            kind: "rock",
            title: "A",
            status: "done",
            openedAt: lastWeek,
            closedAt: thisWeek,
          },
          {
            _id: "b",
            kind: "issue",
            title: "B",
            status: "dropped",
            openedAt: thisWeek,
            closedAt: thisWeek,
          },
        ],
        events: [],
        leads: [],
      },
      now,
      2,
    );
    expect(history[0]).toMatchObject({ opened: 1, done: 1, dropped: 1 });
    expect(history[1]).toMatchObject({ opened: 1, done: 0, dropped: 0 });
  });
});
