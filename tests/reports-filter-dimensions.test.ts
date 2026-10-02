// AC-298 — a live report can be filtered by each of the eight dimensions
// (date range, event stage, salesperson, occasion, service style, venue,
// on/off premise, referral) and the filtered totals change with it. Rows of
// other subjects follow their event; rows with no event are counted as left
// out, never silently dropped.
import { describe, expect, it } from "vitest";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";
import {
  applyReportEventFilters,
  reportFilterRange,
  type ReportFilterEvent,
  type ReportFilterLookups,
  type ReportFilters,
} from "../src/features/reports/reportFilters";

function localDay(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour).getTime();
}

const EVENTS: Array<ReportFilterEvent & Record<string, unknown>> = [
  {
    _id: "ev-a",
    title: "Smith wedding",
    stage: "approved",
    assignedToId: "p-sam",
    occasionId: "o-wedding",
    serviceStyleId: "s-buffet",
    venueId: "v-hall",
    referralSourceId: "r-web",
    quotedPrice: 1000,
    startsAt: localDay(2026, 3, 10),
  },
  {
    _id: "ev-b",
    title: "Office lunch",
    stage: "completed",
    assignedToId: "p-ana",
    occasionId: "o-corporate",
    serviceStyleId: "s-drop",
    venueId: "v-office",
    referralSourceId: "r-friend",
    quotedPrice: 400,
    startsAt: localDay(2026, 4, 2),
  },
  {
    _id: "ev-c",
    title: "Gala",
    stage: "approved",
    assignedToId: "p-sam",
    occasionId: "o-corporate",
    serviceStyleId: "s-buffet",
    venueId: "v-unknown",
    referralSourceId: "r-web",
    quotedPrice: 2500,
    startsAt: localDay(2026, 4, 30, 21),
  },
];

const LOOKUPS: ReportFilterLookups = {
  events: new Map(EVENTS.map((event) => [event._id, event])),
  venueOnPremise: new Map<string, boolean | null>([
    ["v-hall", true],
    ["v-office", false],
    ["v-unknown", null],
  ]),
};

function quotedTotal(filters: ReportFilters): string | undefined {
  const filtered = applyReportEventFilters("events", EVENTS, filters, LOOKUPS);
  const model = buildLiveReportModel(
    "events",
    filtered.rows,
    "all_time",
    reportFilterRange(filters),
  );
  return model.kpis.find((kpi) => kpi.metricId === "events.quoted_revenue")
    ?.value;
}

describe("report filter dimensions", () => {
  it("unfiltered total is every event", () => {
    expect(quotedTotal({})).toBe("$3,900");
  });

  it.each<[string, ReportFilters, string]>([
    ["date range", { from: "2026-04-01", to: "2026-04-30" }, "$2,900"],
    ["event stage", { stage: "completed" }, "$400"],
    ["salesperson", { salespersonId: "p-sam" }, "$3,500"],
    ["occasion", { occasionId: "o-wedding" }, "$1,000"],
    ["service style", { serviceStyleId: "s-drop" }, "$400"],
    ["venue", { venueId: "v-unknown" }, "$2,500"],
    ["on premise", { premise: "on" }, "$1,000"],
    ["off premise", { premise: "off" }, "$400"],
    ["referral", { referralSourceId: "r-friend" }, "$400"],
  ])(
    "a report can be filtered by %s and the total changes",
    (_, filters, total) => {
      expect(quotedTotal(filters)).toBe(total);
    },
  );

  it("the To day keeps the whole day on this device's clock", () => {
    // ev-c starts at 9 pm on Apr 30; a UTC cut would drop it west of UTC.
    expect(quotedTotal({ from: "2026-04-30", to: "2026-04-30" })).toBe(
      "$2,500",
    );
  });

  it("other subjects follow their event and count rows with no event", () => {
    const invoices = [
      {
        _id: "inv-1",
        eventId: "ev-a",
        total: 1000,
        amountDue: 1000,
        status: "sent",
      },
      {
        _id: "inv-2",
        eventId: "ev-b",
        total: 400,
        amountDue: 0,
        status: "paid",
      },
      { _id: "inv-3", total: 50, amountDue: 50, status: "sent" },
    ];
    const filtered = applyReportEventFilters(
      "finance",
      invoices,
      { salespersonId: "p-sam" },
      LOOKUPS,
    );
    expect(filtered.rows.map((row) => (row as { _id: string })._id)).toEqual([
      "inv-1",
    ]);
    expect(filtered.filteredOut).toBe(1);
    expect(filtered.noEvent).toBe(1);
  });
});
