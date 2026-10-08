// @vitest-environment jsdom
// AC-308 (CF-7.4-05): each commission figure on Comp Master links to the
// revenue split behind it and to its event.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seed: Record<string, object[]> = {};

vi.mock("../src/lib/manifest-convex-react", () => {
  const list = (name: string) => () => seed[name] ?? [];
  return {
    useListEvent: list("events"),
    useListRevenueAttribution: list("attributions"),
    useListPerson: list("people"),
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
  useEventsById: () => seed.events ?? [],
}));

import { CompMasterDashboardPage } from "../src/features/reports/CompMasterDashboardPage";

describe("Comp Master source evidence", () => {
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

  it("each commission figure links to its contributing attribution rows", () => {
    seed.events = [
      { _id: "e1", title: "Smith wedding", stage: "completed" },
      { _id: "e2", title: "Cancelled party", stage: "cancelled" },
    ];
    seed.people = [{ _id: "p1", givenName: "Sam", familyName: "Seller" }];
    seed.attributions = [
      {
        _id: "a1",
        eventId: "e1",
        salespersonId: "p1",
        attributionType: "sales_commission",
        status: "applied",
        allocatedAmount: 96,
        appliedAt: 1,
      },
      {
        _id: "a2",
        eventId: "e2",
        salespersonId: "p1",
        attributionType: "sales_commission",
        status: "applied",
        allocatedAmount: 50,
        appliedAt: 1,
      },
      {
        _id: "a3",
        eventId: "e1",
        salespersonId: "p1",
        attributionType: "sales_commission",
        status: "draft",
        allocatedAmount: 70,
      },
    ];
    act(() => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(CompMasterDashboardPage),
        ),
      );
    });
    // All-time figures load only when asked for: ask, as a user would.
    const ask = [...container.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").startsWith("Show all-time"),
    );
    if (ask) act(() => ask.click());
    const links = [...container.querySelectorAll("a")].map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toContainEqual(["Smith wedding", "/events/e1"]);
    expect(links).toContainEqual(["$96", "/finance/attribution/a1"]);
    // Only the applied split on a live event is listed.
    expect(links.some(([, href]) => href === "/finance/attribution/a2")).toBe(
      false,
    );
    expect(links.some(([, href]) => href === "/finance/attribution/a3")).toBe(
      false,
    );
  });
});
