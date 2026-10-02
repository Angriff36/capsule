// @vitest-environment jsdom
// A dashboard figure and the live report built from the same rows agree:
// the dashboard's record set is the live report with the matching stage
// filter applied.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seed: { events: Record<string, unknown>[] } = { events: [] };

vi.mock("../src/lib/manifest-convex-react", () => ({
  useListEvent: () => seed.events,
  useListLead: () => [],
  useListClient: () => [],
  useListPerson: () => [],
  useListEventCloseout: () => [],
  useListVenue: () => [],
}));

import { SalesDashboardPage } from "../src/features/reports/SalesDashboardPage";
import { TimsKPIsDashboardPage } from "../src/features/reports/TimsKPIsDashboardPage";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";
import {
  applyReportEventFilters,
  type ReportFilterEvent,
  type ReportFilters,
} from "../src/features/reports/reportFilters";

const at = Date.now() - 86_400_000;

function event(_id: string, stage: string, quotedPrice: number) {
  return { _id, title: _id, stage, quotedPrice, startsAt: at, createdAt: at };
}

function liveQuotedRevenue(filters: ReportFilters): number {
  const lookups = {
    events: new Map(
      seed.events.map((row) => [
        String(row._id),
        row as unknown as ReportFilterEvent,
      ]),
    ),
    venueOnPremise: new Map<string, boolean>(),
  };
  const { rows } = applyReportEventFilters(
    "events",
    seed.events,
    filters,
    lookups,
  );
  const model = buildLiveReportModel("events", rows, "all_time");
  const kpi = model.kpis.find((k) => k.metricId === "events.quoted_revenue");
  expect(kpi).toBeDefined();
  return money(String(kpi!.value));
}

function money(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ""));
}

describe("dashboard figures match the live report", () => {
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
    seed.events = [];
  });

  function cardValue(Page: ComponentType, title: string): number {
    act(() => {
      root.render(createElement(MemoryRouter, null, createElement(Page)));
    });
    const heading = [...container.querySelectorAll("h3")].find(
      (h3) => (h3.textContent ?? "").trim() === title,
    );
    expect(heading, `card "${title}"`).toBeDefined();
    const value = heading!.parentElement!.querySelector("span.font-mono");
    return money(value?.textContent ?? "");
  }

  it("a dashboard figure equals the corresponding live-report measure on the same seed (Tim's KPIs completed revenue)", () => {
    seed.events = [
      event("c1", "completed", 1200),
      event("c2", "completed", 800),
      event("a1", "approved", 500),
      event("q1", "quote", 900),
      event("x1", "cancelled", 300),
    ];
    const dashboard = cardValue(TimsKPIsDashboardPage, "Total Revenue");
    expect(dashboard).toBe(2000);
    expect(dashboard).toBe(liveQuotedRevenue({ stage: "completed" }));
  });

  it("a dashboard figure equals the corresponding live-report measure on the same seed (Sales booked revenue)", () => {
    seed.events = [
      event("a1", "approved", 1200),
      event("a2", "approved", 2000),
      event("q1", "quote", 900),
      event("p1", "planning", 400),
      event("x1", "cancelled", 300),
    ];
    const dashboard = cardValue(SalesDashboardPage, "Booked Revenue");
    expect(dashboard).toBe(3200);
    expect(dashboard).toBe(liveQuotedRevenue({ stage: "approved" }));
  });
});
