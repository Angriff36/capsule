/**
 * Runtime proof (PL-REPORT-EXPORT, AC-146): at and beyond the 2,000-row read
 * limit the screen, print, CSV and Excel copies of one report run agree on the
 * choices it ran with, the run time, the row count, the totals and the
 * missing-row notice, and the cut names the records it stopped reading.
 * Synthetic workspace only.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import { TPP_GENERAL_REPORTS } from "../../src/features/reports/tpp/catalog.general";
import {
  tppCsvText,
  tppExcelXml,
} from "../../src/features/reports/tpp/exports";
import {
  tppReportSummary,
  tppSummaryLines,
} from "../../src/features/reports/tpp/reportSummary";
import { TppReportResult } from "../../src/features/reports/tpp/TppReportResult";
import type {
  TppReportRequest,
  TppReportResult as Result,
} from "../../src/features/reports/tpp/types";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

type Actor = ReturnType<ReturnType<typeof harness>["asRole"]>;

const tenantId = "tenant-report-export-parity";
const day = Date.UTC(2026, 8, 20);
const LIMIT = 2_000;
const definition = TPP_GENERAL_REPORTS.find(
  (report) => report.id === "contact-lead-opportunities",
)!;
const request: TppReportRequest = {
  reportId: definition.id,
  parameters: {
    dateRangeStart: Date.UTC(2026, 0, 1),
    dateRangeEnd: Date.UTC(2026, 11, 31),
  },
  asOf: day,
};
const noOptions = {
  events: [],
  clients: [],
  people: [],
  vendors: [],
  venues: [],
};

async function addLeads(owner: Actor, from: number, count: number) {
  await owner.run(async (ctx) => {
    for (let index = from; index < from + count; index += 1)
      await ctx.db.insert(
        "leads" as never,
        {
          tenantId,
          version: 1,
          createdAt: day,
          updatedAt: day,
          leadType: "company",
          companyName: `Lead ${index}`,
          source: "web",
          estimatedValue: 100,
          stage: "new",
          probability: 10,
          capturedAt: day,
        } as never,
      );
  });
}

/** Each output of one run, read the way a person would read it. */
function outputs(result: Result) {
  const summary = tppReportSummary(definition, request, result, noOptions);
  const csv = tppCsvText(result, summary).replace(/^﻿/, "").split("\r\n");
  const blank = csv.indexOf("");
  const excel = tppExcelXml(result, summary);
  const excelRows = excel.match(/<Row>/g)?.length ?? 0;
  const screen = renderToStaticMarkup(
    createElement(TppReportResult, { result, summary }),
  );
  return {
    summary,
    lines: tppSummaryLines(summary),
    csv,
    csvRows: (blank === -1 ? csv.length : blank) - 1,
    excel,
    // header row + data rows + a blank row + one row per summary line
    excelRows: excelRows - 1 - 1 - tppSummaryLines(summary).length,
    screen,
    screenRows: (screen.match(/<tr>/g)?.length ?? 0) - 1,
  };
}

describe("runtime proof: report copies agree at the read limit (AC-146)", () => {
  it("at and beyond the 2000-row limit the screen, CSV, Excel and print notice agree and the truncation is named", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "report-export-owner",
      role: "owner",
      tenantId,
    });
    await addLeads(owner, 0, LIMIT);

    const atLimit = (await owner.query(api.tppReports.general.run, {
      reportId: request.reportId,
      parameters: request.parameters,
    })) as Result;
    const at = outputs(atLimit);
    expect(atLimit.notices ?? []).toEqual([]);
    expect(at.summary.rowCount).toBe(LIMIT);
    expect(at.csvRows).toBe(LIMIT);
    expect(at.excelRows).toBe(LIMIT);
    expect(at.screenRows).toBe(LIMIT);
    expect(at.csv.join("\n")).not.toContain("Missing rows");
    expect(at.screen).not.toContain("live-report-notice");

    await addLeads(owner, LIMIT, 1);
    const beyond = (await owner.query(api.tppReports.general.run, {
      reportId: request.reportId,
      parameters: request.parameters,
    })) as Result;
    const out = outputs(beyond);
    expect(beyond.notices).toHaveLength(1);
    const notice = beyond.notices![0];
    // The cut is named: which records, how many were read, what to do.
    expect(notice).toContain("first 2,000 leads");
    expect(notice).toContain("rows may be missing");

    // Row count: the same 2,000 rows everywhere, and every copy says so.
    expect(out.summary.rowCount).toBe(LIMIT);
    expect(out.csvRows).toBe(LIMIT);
    expect(out.excelRows).toBe(LIMIT);
    expect(out.screenRows).toBe(LIMIT);

    // Choices, run time, row count and the notice: one list, every copy.
    expect(out.lines.map((line) => line.label)).toEqual([
      "Date range",
      "Run at",
      "Rows",
      "Missing rows",
    ]);
    for (const line of out.lines) {
      expect(out.csv.join("\n")).toContain(line.value);
      expect(out.excel).toContain(line.value);
      expect(out.screen).toContain(line.value);
    }
    // The screen is the print copy: the notice sits inside the print sheet.
    const sheet = out.screen.indexOf("print-sheet");
    expect(sheet).toBeGreaterThan(-1);
    expect(out.screen.indexOf(notice)).toBeGreaterThan(sheet);
    // Every column is in each copy.
    const labels = (beyond as Extract<Result, { kind: "table" }>).columns.map(
      (column) => column.label,
    );
    expect(out.csv[0].split(",")).toEqual(labels);
    for (const label of labels) {
      expect(out.excel).toContain(`>${label}<`);
      expect(out.screen).toContain(`>${label}<`);
    }
  }, 120_000);
});
