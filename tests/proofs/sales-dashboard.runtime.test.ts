// @vitest-environment jsdom
// AC-309 (CF-7.4-06): pipeline, booked revenue, conversion, average value and
// the 3% basis compute from seeded leads and events.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commissionBasis } from "../../src/features/reports/dashboardRecordSets";

const seed: Record<string, object[]> = {};

vi.mock("../../src/lib/manifest-convex-react", () => {
  const list = (name: string) => () => seed[name] ?? [];
  return {
    useListEvent: list("events"),
    useListLead: list("leads"),
    useListClient: list("clients"),
    useListPerson: list("people"),
  };
});

import { SalesDashboardPage } from "../../src/features/reports/SalesDashboardPage";

describe("sales dashboard", () => {
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

  const card = (title: string) => {
    const h3 = [...container.querySelectorAll("h3")].find(
      (el) => (el.textContent ?? "").trim() === title,
    );
    expect(h3, title).toBeDefined();
    return h3!.parentElement!.textContent ?? "";
  };

  it("pipeline, booked revenue, conversion, avg value and the 3% basis compute correctly from seeded leads/events", () => {
    seed.events = [
      {
        _id: "e1",
        stage: "approved",
        quotedPrice: 4000,
        assignedToId: "p1",
        clientId: "c1",
      },
      {
        _id: "e2",
        stage: "completed",
        quotedPrice: 2000,
        assignedToId: "p2",
        clientId: "c1",
      },
      {
        _id: "e3",
        stage: "quote",
        quotedPrice: 9000,
        assignedToId: "p1",
        clientId: "c1",
      },
      {
        _id: "e4",
        stage: "cancelled",
        quotedPrice: 7000,
        assignedToId: "p1",
        clientId: "c1",
      },
    ];
    seed.leads = [
      { _id: "l1", stage: "new" },
      { _id: "l2", stage: "qualified" },
      { _id: "l3", stage: "converted" },
      { _id: "l4", stage: "lost" },
    ];
    seed.people = [
      { _id: "p1", givenName: "Sam", familyName: "Seller" },
      { _id: "p2", givenName: "Pat", familyName: "Planner" },
    ];
    seed.clients = [{ _id: "c1", name: "Acme" }];
    act(() => {
      root.render(
        createElement(MemoryRouter, null, createElement(SalesDashboardPage)),
      );
    });

    // Booked = approved or later with a price: $4,000 + $2,000.
    expect(card("Booked Revenue")).toContain("$6,000");
    expect(card("Avg Event Value")).toContain("$3,000");
    // 1 of 4 leads converted.
    expect(card("Conversion Rate")).toContain("25.0%");
    expect(card("Total Leads")).toContain("4");

    // 3% basis per salesperson: Sam $4,000 -> $120, Pat $2,000 -> $60.
    const tableText = container.textContent ?? "";
    expect(tableText).toContain("3% Basis");
    expect(tableText).toContain("$120");
    expect(tableText).toContain("$60");
    // The note gives the company-wide basis: 3% of $6,000.
    expect(tableText).toContain("$180");
  });

  it("the 3% basis rounds to the cent", () => {
    expect(commissionBasis(1234.56)).toBe(37.04);
    expect(commissionBasis(0)).toBe(0);
  });
});
