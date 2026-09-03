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
