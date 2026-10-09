// @vitest-environment jsdom
// AC-306 (CF-7.4-03): the L10 page shows the scorecard, priorities (rocks),
// issues, to-dos and meeting-period history from live rows. PL-DASHBOARDS:
// it also follows the owner's L10 meeting sheet - agenda and rules, a weekly
// mark on each priority, client and people headlines, solving an issue with
// the agreed answer, and the meeting's 1-10 rating.
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
const markTrack = vi.fn();
const solve = vi.fn();
const recordMeeting = vi.fn();
const reviseMeeting = vi.fn();

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
    useListLeadershipItem: list("items"),
    useCreateLeadershipItem: () => vi.fn(),
    useLeadershipItemComplete: () => complete,
    useLeadershipItemDrop: () => vi.fn(),
    useLeadershipItemReopen: () => vi.fn(),
    useLeadershipItemMarkTrack: () => markTrack,
    useLeadershipItemSolve: () => solve,
    useListLeadershipMeeting: list("meetings"),
    useCreateLeadershipMeeting: () => recordMeeting,
    useLeadershipMeetingRevise: () => reviseMeeting,
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
    item("h1", "client_headline", "Bride sent a thank-you", "open"),
    item("h2", "people_headline", "New sous chef starts", "open"),
  ];
  seed.meetings = [
    {
      _id: "m1",
      heldAt: lastWeek + 60 * 60 * 1000,
      rating: 7,
      recordedAt: lastWeek,
      version: 1,
    },
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
    for (const fn of [complete, markTrack, solve, recordMeeting, reviseMeeting])
      fn.mockReset();
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
    // Headlines are not counted as added; last week's meeting was rated 7.
    expect(cells(0).slice(1)).toEqual(["0", "1", "0", "1", "$2,000", "0", "—"]);
    expect(cells(1).slice(1)).toEqual([
      "4",
      "0",
      "0",
      "0",
      "$0",
      "1",
      "7 / 10",
    ]);

    // The owner's sheet: 60-minute agenda in eight parts, and headlines.
    const agenda = table("l10-agenda");
    expect(agenda).toContain("Good news");
    expect(agenda).toContain("Rate the meeting");
    expect(
      container.querySelectorAll("[data-testid='l10-agenda'] li"),
    ).toHaveLength(8);
    expect(container.textContent).toContain("60 minutes");
    expect(container.textContent).not.toContain("90-minute");
    expect(table("leadership-client_headline")).toContain(
      "Bride sent a thank-you",
    );
    expect(table("leadership-people_headline")).toContain(
      "New sous chef starts",
    );
    expect(table("leadership-client_headline")).toContain("Heard");
  });

  it("a priority gets this week's mark and an issue is solved with the agreed answer", async () => {
    seedRows();
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(L10DashboardPage)),
      );
    });
    const picker = container.querySelector(
      "[data-testid='leadership-rock'] select",
    ) as HTMLSelectElement;
    await act(async () => {
      picker.value = "off_track";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(markTrack).toHaveBeenCalledWith({
      docId: "r1",
      version: 1,
      track: "off_track",
    });

    const issues = container.querySelector("[data-testid='leadership-issue']")!;
    const solveButton = [...issues.querySelectorAll("button")].find(
      (b) => b.textContent === "Solve",
    )!;
    await act(async () => {
      solveButton.click();
    });
    const answer = issues.querySelector("input") as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setValue.call(answer, "Use the second rental company");
      answer.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      answer.form!.requestSubmit();
    });
    expect(solve).toHaveBeenCalledWith({
      docId: "i1",
      version: 1,
      solution: "Use the second rental company",
    });
  });

  it("rating the meeting needs a score and saves this week's meeting", async () => {
    seedRows();
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(L10DashboardPage)),
      );
    });
    const form = container.querySelector(
      "[data-testid='l10-rating']",
    ) as HTMLFormElement;
    await act(async () => {
      form.requestSubmit();
    });
    expect(recordMeeting).not.toHaveBeenCalled();
    expect(form.textContent).toContain("Pick a score from 1 to 10.");

    const nine = [...form.querySelectorAll("button")].find(
      (b) => b.textContent === "9",
    )!;
    await act(async () => {
      nine.click();
    });
    await act(async () => {
      form.requestSubmit();
    });
    expect(recordMeeting).toHaveBeenCalledTimes(1);
    const saved = recordMeeting.mock.calls[0][0];
    expect(saved.rating).toBe(9);
    expect(saved.heldAt).toEqual(expect.any(Number));
    expect(reviseMeeting).not.toHaveBeenCalled();
  });

  it("this week's rated meeting is corrected, not written twice", async () => {
    seedRows();
    seed.meetings = [
      {
        _id: "m2",
        heldAt: thisWeek + 60 * 60 * 1000,
        rating: 6,
        recordedAt: thisWeek,
        version: 3,
      },
    ];
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(L10DashboardPage)),
      );
    });
    const form = container.querySelector(
      "[data-testid='l10-rating']",
    ) as HTMLFormElement;
    expect(form.textContent).toContain("6 out of 10");
    await act(async () => {
      form.requestSubmit();
    });
    expect(recordMeeting).not.toHaveBeenCalled();
    expect(reviseMeeting).toHaveBeenCalledWith(
      expect.objectContaining({ docId: "m2", version: 3, rating: 6 }),
    );
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
