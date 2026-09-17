import { describe, expect, it } from "vitest";
import { ReportLifecyclePolicy } from "../src/features/reports/ReportLifecyclePolicy";
import { ReportCreatePayloadBuilder } from "../src/features/reports/ReportCreateForm";
import {
  SavedReportDefinitionArchiveLifecycle,
  SavedReportDefinitionRestoreLifecycle,
} from "../src/generated/manifest-wiring-bindings";
import { NAV_AREAS } from "../src/app/nav";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";
import {
  canReadReportSubject,
  reportSubjectCapability,
} from "../src/features/reports/liveReportSubjectAccess";
import {
  canEditSavedReportDefinition,
  SAVED_REPORT_READ_ONLY_NOTICE,
} from "../src/features/reports/reportEditAccess";
import { reportCsv } from "../src/features/reports/liveReportModel";

describe("Reports routes and lifecycle bindings", () => {
  it("exposes /reports as a shipping nav area", () => {
    const reports = NAV_AREAS.find((area) => area.path === "/reports");
    expect(reports).toBeDefined();
    expect(reports?.label).toBe("Reports");
  });

  it("derives archive/restore from generated lifecycle metadata", () => {
    const policy = new ReportLifecyclePolicy();
    expect(policy.reportActions("active").map((a) => a.key)).toEqual([
      "archive",
    ]);
    expect(policy.reportActions("archived").map((a) => a.key)).toEqual([
      "restore",
    ]);
    expect(policy.canEditDefinition("active", Date.now())).toBe(true);
    expect(policy.canEditDefinition("archived", Date.now())).toBe(false);
    expect(SavedReportDefinitionArchiveLifecycle[0]?.from).toBe("active");
    expect(SavedReportDefinitionRestoreLifecycle[0]?.from).toBe("archived");
  });

  it("builds create payloads from the form", () => {
    const builder = new ReportCreatePayloadBuilder();
    const data = new FormData();
    data.set("name", "Ops load");
    data.set("subjectArea", "logistics");
    data.set("chartType", "bar");
    data.set("sharingScope", "team");
    data.set("notes", "proof");
    expect(builder.fromForm(data)).toEqual({
      name: "Ops load",
      subjectArea: "logistics",
      chartType: "bar",
      sharingScope: "team",
      definition: { version: 2, dateWindow: "90_days", notes: "proof" },
    });
  });
});

describe("live report money, range, capability, viewer, and CSV contracts", () => {
  it("counts actual amountPaid, not a credit-adjusted balance, as collected", () => {
    const model = buildLiveReportModel(
      "finance",
      [
        {
          _id: "credited-only",
          total: 100,
          amountDue: 50,
          amountPaid: 0,
          amountCredited: 50,
          status: "partial",
          issuedAt: Date.now(),
        },
        {
          _id: "paid",
          total: 100,
          amountDue: 0,
          amountPaid: 100,
          status: "paid",
          issuedAt: Date.now(),
        },
      ],
      "all_time",
    );
    expect(model.kpis.find((kpi) => kpi.label === "Collected")?.value).toBe(
      "$100",
    );
    expect(model.rows.map((row) => row.values.functionalPaid)).toEqual([
      0, 100,
    ]);
  });

  it("emits exactly twelve current-month buckets and drops older records", () => {
    const now = new Date();
    const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15);
    const oldMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 12, 15);
    const model = buildLiveReportModel(
      "events",
      [
        { _id: "current", startsAt: currentMonth },
        { _id: "old", startsAt: oldMonth },
      ],
      "12_months",
    );
    expect(model.trend).toHaveLength(12);
    expect(model.rows.map((row) => row.id)).toEqual(["current"]);
    expect(model.trend.at(-1)?.label).toBe(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(currentMonth)),
    );
  });

  it("drops a future-dated record instead of fabricating a 13th trend bucket", () => {
    // filterRows only enforces dateOf(row) >= windowStart (see
    // liveReportBuilders.ts filterRows): there is no upper bound, so a row
    // dated after "now" — a scheduled event, exactly the kind of record a
    // forward-scheduling app like this one keeps — still reaches
    // monthlyTrend. Reproduces the real prod defect (not the grep-only one
    // the guard covered): with monthlyTrend's earliestBucket/latestBucket
    // check removed, this "future" row lands in `buckets.get(key) ??
    // emptyBucket(...)` and adds a 13th point past the seeded 12-month
    // range, through the real buildLiveReportModel -> monthlyTrend path,
    // not a source grep.
    const now = new Date();
    const currentMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15);
    const future = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 10);
    const model = buildLiveReportModel(
      "events",
      [
        { _id: "current", startsAt: currentMonth },
        { _id: "future", startsAt: future },
      ],
      "12_months",
    );
    expect(model.trend).toHaveLength(12);
    expect(model.trend.at(-1)?.label).toBe(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }).format(new Date(currentMonth)),
    );
    // The scheduled-ahead event is still a real row: filterRows keeps it
    // (KPIs/table/CSV should show upcoming events), only the trend chart's
    // fixed 12-bucket range excludes it.
    expect(model.rows.map((row) => row.id).sort()).toEqual([
      "current",
      "future",
    ]);
  });

  it("maps Production to kitchen and fails closed when kitchen is disabled", () => {
    expect(reportSubjectCapability("production")).toBe("kitchen");
    expect(canReadReportSubject("production", "admin", ["kitchen"])).toBe(
      false,
    );
    expect(canReadReportSubject("production", "kitchen_staff", [])).toBe(true);
  });

  it("keeps Apply read-only for a shared-report viewer", () => {
    expect(
      canEditSavedReportDefinition(
        { ownerId: "owner" },
        { personId: "viewer", role: "staff" },
      ),
    ).toBe(false);
    expect(
      canEditSavedReportDefinition(
        { ownerId: "owner" },
        { personId: "owner", role: "staff" },
      ),
    ).toBe(true);
    expect(
      canEditSavedReportDefinition(
        { ownerId: "owner" },
        { personId: "viewer", role: "manager" },
      ),
    ).toBe(true);
    expect(SAVED_REPORT_READ_ONLY_NOTICE).toContain("only its owner");
  });

  it("exports stable columns, ISO dates, and formula-safe cells", () => {
    const model = buildLiveReportModel(
      "events",
      [
        {
          _id: "csv-row",
          title: "=SUM(A1)",
          startsAt: Date.UTC(2026, 0, 2, 3, 4, 5),
          venueName: "+venue",
          stage: "-draft",
          expectedHeadcount: -4,
          budgetAmount: -5,
          quotedPrice: "@price",
        },
      ],
      "all_time",
    );
    const csv = reportCsv(model, "Quarterly Ops");
    expect(csv.contents.split("\r\n")[0]).toBe(
      '"Event","Start","Venue","Stage","Expected guests","Budget","Quoted price"',
    );
    expect(csv.contents).toContain('"2026-01-02T03:04:05.000Z"');
    expect(csv.contents).toContain("'=SUM(A1)");
    expect(csv.contents).toContain("'+venue");
    expect(csv.contents).toContain("'-draft");
    expect(csv.contents).toContain("'@price");
    expect(csv.contents.split("\r\n")[1]).toBe(
      '"\'=SUM(A1)","2026-01-02T03:04:05.000Z","\'+venue","\'-draft",-4,-5,"\'@price"',
    );
    expect(csv.contents).not.toContain("'-4");
    expect(csv.contents).not.toContain("'-5");
    expect(csv.filename).toMatch(/^quarterly-ops-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
