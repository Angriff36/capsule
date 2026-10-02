// @vitest-environment jsdom
// AC-142 / AC-296 — every shipped report measure names one entry in the shared
// metric list (basis, date, time zone, money, statuses, voids, tax, live vs
// old-system records, company scope, drill), the figure takes its label from
// that entry, and the reader sees the entry on the page.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLiveReportModel } from "../src/features/reports/liveReportBuilders";
import {
  METRIC_DEFINITIONS,
  metricDefinition,
  metricTimeBasisLabel,
  type MetricId,
} from "../src/features/reports/metricDefinitions";
import { MetricDefinitionList } from "../src/features/reports/MetricDefinitionList";
import type { ReportSubjectArea } from "../src/features/reports/ReportCreateForm";
import {
  foodCostPercent,
  isBookedEvent,
  isCompletedEvent,
  percentOf,
  percentText,
  NOT_KNOWN,
} from "../src/features/reports/dashboardRecordSets";

const SUBJECTS: ReportSubjectArea[] = [
  "events",
  "sales",
  "inventory",
  "production",
  "workforce",
  "logistics",
  "finance",
];

const REPORTS_DIR = join(__dirname, "../src/features/reports");
const DASHBOARD_PAGES = readdirSync(REPORTS_DIR).filter((file) =>
  file.endsWith("DashboardPage.tsx"),
);

describe("shared metric definitions", () => {
  it("every shipped measure exposes a declared basis (date, timezone, currency, statuses, voids, tax, ledger-vs-reference)", () => {
    const ids = Object.keys(METRIC_DEFINITIONS) as MetricId[];
    expect(ids.length).toBeGreaterThan(40);
    for (const id of ids) {
      const definition = metricDefinition(id);
      for (const field of [
        "label",
        "measures",
        "source",
        "dateBasis",
        "includes",
        "leftOut",
        "tax",
        "drill",
      ] as const) {
        expect(definition[field].trim(), `${id}.${field}`).not.toBe("");
      }
      expect(["device", "none"]).toContain(definition.timeBasis);
      expect(["company", "none"]).toContain(definition.currency);
      expect(["live", "live_and_reference"]).toContain(definition.recordBasis);
    }
  });

  it("every live-report KPI names a definition and takes its label from it", () => {
    for (const subject of SUBJECTS) {
      const model = buildLiveReportModel(subject, [], "all_time");
      expect(model.kpis.length, subject).toBeGreaterThan(0);
      for (const kpi of model.kpis) {
        expect(METRIC_DEFINITIONS[kpi.metricId], kpi.metricId).toBeDefined();
        expect(kpi.label).toBe(metricDefinition(kpi.metricId).label);
      }
    }
  });

  it("each of the seven dashboards lists only declared measures to the reader", () => {
    expect(DASHBOARD_PAGES).toHaveLength(7);
    for (const page of DASHBOARD_PAGES) {
      const source = readFileSync(join(REPORTS_DIR, page), "utf8");
      expect(source, page).toContain("<MetricDefinitionList");
      const ids = [...source.matchAll(/"(dashboard\.[a-z_]+)"/g)].map(
        (match) => match[1],
      );
      expect(ids.length, page).toBeGreaterThan(0);
      for (const id of ids) {
        expect(id in METRIC_DEFINITIONS, `${page}: ${id}`).toBe(true);
      }
    }
  });

  it("names the reader's own time zone for dated measures", () => {
    expect(metricTimeBasisLabel("device", "America/Chicago")).toContain(
      "America/Chicago",
    );
    expect(metricTimeBasisLabel("none")).toBe("No period.");
  });
});

describe("dashboard record sets keep unknown as unknown", () => {
  it("never turns nothing-to-divide-by into 0%", () => {
    expect(percentOf(3, 0)).toBeNull();
    expect(percentText(null)).toBe(NOT_KNOWN);
    expect(foodCostPercent([])).toBeNull();
    expect(
      foodCostPercent([{ grossProfit: 700, actualIngredientCost: 300 }]),
    ).toBe(30);
  });

  it("books and completes events by one rule", () => {
    expect(isBookedEvent({ stage: "approved", quotedPrice: 0 })).toBe(true);
    expect(isBookedEvent({ stage: "closed_out", quotedPrice: 900 })).toBe(true);
    expect(isBookedEvent({ stage: "quote", quotedPrice: 900 })).toBe(false);
    expect(isBookedEvent({ stage: "planning", quotedPrice: 900 })).toBe(false);
    expect(isBookedEvent({ stage: "cancelled", quotedPrice: 900 })).toBe(false);
    expect(isBookedEvent({ stage: "approved", quotedPrice: null })).toBe(false);
    expect(isCompletedEvent({ stage: "completed", quotedPrice: 900 })).toBe(
      true,
    );
    expect(isCompletedEvent({ stage: "closed_out", quotedPrice: 900 })).toBe(
      true,
    );
    expect(isCompletedEvent({ stage: "completed", quotedPrice: 0 })).toBe(
      false,
    );
  });
});

describe("How these numbers are counted", () => {
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

  it("shows each figure's source, statuses, period, money, records and drill", () => {
    act(() => {
      root.render(
        createElement(MetricDefinitionList, {
          metricIds: ["finance.invoiced", "events.count", "finance.invoiced"],
        }),
      );
    });
    const items = container.querySelectorAll(
      "[data-testid^='metric-definition-']",
    );
    expect(items).toHaveLength(2);
    const text = container.textContent ?? "";
    expect(text).toContain("How these numbers are counted");
    expect(text).toContain("Only your company's records");
    expect(text).toContain("Voided invoices stay in the rows but add $0.");
    expect(text).toContain("Issue date, else the due date.");
    expect(text).toContain("tax and service charge");
    expect(text).toContain("Capsule's own records as they stand now.");
    expect(text).toContain("Open source workspace");
  });
});
