// AC-299 — a filter state round-trips through the app's share convention (the
// page address, ?report=…&f_…) and the saved definition, and the export row
// set equals the screen row set.
import { describe, expect, it } from "vitest";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";
import {
  parseLiveReportDefinition,
  reportCsv,
} from "../src/features/reports/liveReportModel";
import {
  applyReportEventFilters,
  clearReportFiltersFromSearch,
  reportFilterRange,
  reportFiltersFromSearch,
  searchHasReportFilters,
  writeReportFiltersToSearch,
  type ReportFilters,
} from "../src/features/reports/reportFilters";

const FILTERS: ReportFilters = {
  from: "2026-01-01",
  to: "2026-12-31",
  stage: "approved",
  salespersonId: "p-sam",
  occasionId: "o-wedding",
  serviceStyleId: "s-buffet",
  venueId: "v-hall",
  premise: "on",
  referralSourceId: "r-web",
};

describe("report filter sharing", () => {
  it("a filter state round-trips through the page address", () => {
    const params = writeReportFiltersToSearch(
      new URLSearchParams("report=rep-1"),
      FILTERS,
    );
    const link = `/reports?${params.toString()}`;
    const opened = new URL(link, "https://capsule.example").searchParams;
    expect(opened.get("report")).toBe("rep-1");
    expect(searchHasReportFilters(opened)).toBe(true);
    expect(reportFiltersFromSearch(opened)).toEqual(FILTERS);
  });

  it("clearing every filter on screen stays cleared instead of falling back to the saved ones", () => {
    const params = writeReportFiltersToSearch(new URLSearchParams(), {});
    expect(searchHasReportFilters(params)).toBe(true);
    expect(reportFiltersFromSearch(params)).toEqual({});
    expect(searchHasReportFilters(clearReportFiltersFromSearch(params))).toBe(
      false,
    );
  });

  it("the saved definition keeps the filters and drops malformed values", () => {
    expect(
      parseLiveReportDefinition({ dateWindow: "90_days", filters: FILTERS }),
    ).toEqual({ version: 2, dateWindow: "90_days", filters: FILTERS });
    expect(
      parseLiveReportDefinition({
        dateWindow: "90_days",
        filters: { from: "01/02/2026", premise: "maybe", stage: "" },
      }),
    ).toEqual({ version: 2, dateWindow: "90_days" });
  });

  it("the export row set equals the screen row set", () => {
    const events = [
      {
        _id: "ev-a",
        title: "Kept",
        stage: "approved",
        startsAt: new Date(2026, 2, 1).getTime(),
      },
      {
        _id: "ev-b",
        title: "Other stage",
        stage: "quote",
        startsAt: new Date(2026, 2, 2).getTime(),
      },
    ];
    const filters: ReportFilters = { stage: "approved" };
    const filtered = applyReportEventFilters("events", events, filters, {
      events: new Map(events.map((event) => [event._id, event])),
      venueOnPremise: new Map(),
    });
    const model = buildLiveReportModel(
      "events",
      filtered.rows,
      "all_time",
      reportFilterRange(filters),
    );
    const lines = reportCsv(model, "Filtered").contents.trim().split("\r\n");
    expect(lines).toHaveLength(1 + model.rows.length);
    expect(model.rows.map((row) => row.id)).toEqual(["ev-a"]);
    expect(lines[1]).toContain('"Kept"');
    expect(lines.join("\n")).not.toContain("Other stage");
  });
});
