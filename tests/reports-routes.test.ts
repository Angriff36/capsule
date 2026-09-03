import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

  it("wires ReportsPage in App.tsx", () => {
    const app = readFileSync(
      path.join(process.cwd(), "src/app/App.tsx"),
      "utf8",
    );
    expect(app).toContain('path="/reports"');
    expect(app).toContain("ReportsPage");
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

    const builder = readFileSync(
      "src/features/reports/liveReportBuilders.ts",
      "utf8",
    );
    expect(builder).toContain("number(row.amountPaid)");
    expect(builder).not.toContain("invoiceTotal(row) - invoiceDue(row)");
    expect(builder).toContain("function collectedInvoiceTotal");
    const data = readFileSync(
      "src/features/reports/LiveReportData.tsx",
      "utf8",
    );
    expect(data).toContain("useListPayment");
    expect(data).toContain("rowsWithActualPayments");
    expect(data).toContain('payment.status !== "completed"');
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

    const builder = readFileSync(
      "src/features/reports/liveReportBuilders.ts",
      "utf8",
    );
    expect(builder).toContain("MONTHS_IN_YEAR - 1");
    expect(builder).toContain("return Date.UTC(");
  });

  it("maps Production to kitchen and fails closed when kitchen is disabled", () => {
    expect(reportSubjectCapability("production")).toBe("kitchen");
    expect(canReadReportSubject("production", "admin", ["kitchen"])).toBe(
      false,
    );
    expect(canReadReportSubject("production", "kitchen_staff", [])).toBe(true);

    const source = readFileSync(
      "src/features/reports/LiveReportData.tsx",
      "utf8",
    );
    expect(source).toContain("canReadReportSubject");
    expect(source).not.toContain("disabledCapabilities?.includes(subject)");
    const policy = readFileSync(
      "src/features/reports/liveReportSubjectAccess.ts",
      "utf8",
    );
    expect(policy).toContain('production: "kitchen"');
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

    const workspace = readFileSync(
      "src/features/reports/LiveReportWorkspace.tsx",
      "utf8",
    );
    expect(workspace).toContain("disabled={controlsLocked}");
    expect(workspace).toContain("if (!canEditSettings) return");
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
          expectedHeadcount: 4,
          budgetAmount: 5,
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
    expect(csv.filename).toMatch(/^quarterly-ops-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
