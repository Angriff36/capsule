// @vitest-environment jsdom
// AC-145 — a KPI drill-down lists exactly its contributing records, and the
// report surface shows how many rows were left out (outside the period,
// deleted, no date) and how many counted rows share a number (possible
// doubles). The export holds exactly the rows on screen.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/manifest-convex-react", () => ({
  useListPerson: () => [],
  useListOccasion: () => [],
  useListServiceStyle: () => [],
  useListVenue: () => [],
  useListReferralSource: () => [],
}));

import { LiveReportWorkspace } from "../src/features/reports/LiveReportWorkspace";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";

const now = Date.now();
const DAY = 86_400_000;
const PROPOSALS = [
  {
    _id: "p-1",
    proposalNumber: "P-100",
    status: "accepted",
    total: 500,
    sentAt: now - DAY,
  },
  {
    _id: "p-2",
    proposalNumber: "P-100",
    status: "sent",
    total: 300,
    sentAt: now - 2 * DAY,
  },
  {
    _id: "p-3",
    proposalNumber: "P-101",
    status: "accepted",
    total: 700,
    sentAt: now - 3 * DAY,
  },
  {
    _id: "p-old",
    proposalNumber: "P-090",
    status: "accepted",
    total: 900,
    sentAt: now - 200 * DAY,
  },
  {
    _id: "p-gone",
    proposalNumber: "P-091",
    status: "accepted",
    total: 100,
    sentAt: now - DAY,
    deletedAt: now,
  },
];

describe("KPI drill-down and left-out counts", () => {
  it("each KPI names exactly the rows it is made from", () => {
    const model = buildLiveReportModel("sales", PROPOSALS, "30_days");
    const accepted = model.kpis.find(
      (kpi) => kpi.metricId === "sales.accepted_value",
    );
    expect(accepted?.value).toBe("$1,200");
    expect(accepted?.rowIds?.sort()).toEqual(["p-1", "p-3"]);
    const all = model.kpis.find((kpi) => kpi.metricId === "sales.proposals");
    expect(all?.rowIds).toBeNull();
    expect(model.rows.map((row) => row.id).sort()).toEqual([
      "p-1",
      "p-2",
      "p-3",
    ]);
    expect(model.leftOut).toEqual({
      deleted: 1,
      outsidePeriod: 1,
      noDate: 0,
      repeatedNumbers: 2,
    });
  });

  describe("on the report screen", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
      (
        globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    it("KPI drill-down lists exactly its contributing records and shows excluded/unresolved/duplicate counts on the report surface", () => {
      const model = buildLiveReportModel("sales", PROPOSALS, "30_days");
      act(() => {
        root.render(
          createElement(
            MemoryRouter,
            null,
            createElement(LiveReportWorkspace, {
              report: {
                _id: "rep-1",
                version: 1,
                status: "active",
                name: "Pipeline",
              },
              subject: "sales",
              savedDateWindow: "30_days",
              savedChartType: "table",
              usedChartFallback: false,
              model,
              loading: false,
              sourceAvailable: true,
              busy: false,
              canEditSettings: true,
              onApply: () => undefined,
              filters: { stage: "approved" },
              onFiltersChange: () => undefined,
              leftOut: { noEvent: 2, filteredOut: 4 },
            }),
          ),
        );
      });
      const text = () => container.textContent ?? "";
      const bodyRows = () =>
        container.querySelectorAll(".live-report-table tbody tr").length;
      expect(bodyRows()).toBe(3);
      expect(text()).toContain("Not counted: 1 outside the period, 1 deleted.");
      expect(text()).toContain("2 counted rows share a number");
      expect(text()).toContain("Left out by the filters: 4 rows.");
      expect(text()).toContain("2 more rows belong to no event you can see");

      const drill = container.querySelector<HTMLButtonElement>(
        "[data-testid='report-kpi-drill-sales.accepted_value']",
      );
      expect(drill?.textContent).toBe("See the 2 rows behind it");
      act(() => drill!.click());
      expect(bodyRows()).toBe(2);
      expect(text()).toContain("2 rows behind Accepted value");
      expect(text()).not.toContain("P-090");
      act(() => drill!.click());
      expect(bodyRows()).toBe(3);
    });
  });
});
