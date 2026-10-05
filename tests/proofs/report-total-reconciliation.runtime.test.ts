// AC-144 (PR11-05) — revenue, payment, stock, staffing and recipe-cost report
// totals equal the sum of their owning records for the chosen period, and an
// unknown cost, price or quantity stays unknown with a coverage count, never
// a zero or a complete-looking total.
import { describe, expect, it } from "vitest";
import { calculateComponentCost } from "../../src/features/kitchen/ComponentCostCalculator";
import {
  foodCostPercent,
  isBookedEvent,
  percentText,
  NOT_KNOWN,
} from "../../src/features/reports/dashboardRecordSets";
import { buildLiveReportModel } from "../../src/features/reports/liveReportBuilders";
import { rowsWithActualPayments } from "../../src/features/reports/liveReportPayments";
import type { LiveReportModel } from "../../src/features/reports/liveReportModel";
import type { MetricId } from "../../src/features/reports/metricDefinitions";

const HOUR = 3_600_000;
const now = Date.now();
const recent = now - 5 * 86_400_000;
const old = now - 400 * 86_400_000;

function kpiValue(model: LiveReportModel, id: MetricId): string | undefined {
  return model.kpis.find((kpi) => kpi.metricId === id)?.value;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

describe("report totals reconcile to their owning records", () => {
  it("revenue: quoted revenue equals the events in the period, booked revenue the booked ones", () => {
    const events = [
      { _id: "e1", stage: "approved", quotedPrice: 1200, startsAt: recent },
      { _id: "e2", stage: "quote", quotedPrice: 800, startsAt: recent },
      { _id: "e3", stage: "cancelled", quotedPrice: 500, startsAt: recent },
      { _id: "e4", stage: "completed", quotedPrice: 2000, startsAt: old },
      {
        _id: "e5",
        stage: "approved",
        quotedPrice: 99,
        startsAt: recent,
        deletedAt: now,
      },
    ];
    const model = buildLiveReportModel("events", events, "90_days");
    const inPeriod = events.filter(
      (e) => e.deletedAt == null && e.startsAt >= now - 90 * 86_400_000,
    );
    const quoted = inPeriod.reduce((total, e) => total + e.quotedPrice, 0);
    expect(kpiValue(model, "events.quoted_revenue")).toBe(money(quoted));
    expect(model.rows).toHaveLength(inPeriod.length);
    expect(model.leftOut).toMatchObject({ deleted: 1, outsidePeriod: 1 });

    const booked = events.filter(
      (e) => e.deletedAt == null && isBookedEvent(e),
    );
    expect(booked.map((e) => e._id)).toEqual(["e1", "e4"]);
  });

  it("payment: Collected equals completed payments on the invoices, nothing else", () => {
    const invoices = [
      {
        _id: "i1",
        total: 1000,
        amountDue: 400,
        status: "partial",
        issuedAt: recent,
      },
      {
        _id: "i2",
        total: 500,
        amountDue: 500,
        status: "sent",
        issuedAt: recent,
      },
      {
        _id: "i3",
        total: 700,
        amountDue: 0,
        status: "voided",
        issuedAt: recent,
      },
    ];
    const payments = [
      { _id: "pay1", invoiceId: "i1", amount: 600, status: "completed" },
      { _id: "pay2", invoiceId: "i2", amount: 500, status: "pending" },
      { _id: "pay3", invoiceId: "i2", amount: 200, status: "refunded" },
      { _id: "pay4", invoiceId: "i3", amount: 700, status: "completed" },
    ];
    const model = buildLiveReportModel(
      "finance",
      rowsWithActualPayments(invoices, payments),
      "all_time",
    );
    // i3 is voided: its payment is evidence on the row but adds $0.
    expect(kpiValue(model, "finance.collected")).toBe(money(600));
    expect(kpiValue(model, "finance.invoiced")).toBe(money(1500));
    expect(kpiValue(model, "finance.outstanding")).toBe(money(900));
    expect(
      model.kpis.find((kpi) => kpi.metricId === "finance.collected")?.rowIds,
    ).toEqual(["i1", "i2"]);
  });

  it("stock: demand counts equal the demand lines by status, units never added together", () => {
    const lines = [
      {
        _id: "d1",
        status: "confirmed",
        requiredQuantity: 10,
        unit: "pound",
        purchasingWeekStart: recent,
      },
      {
        _id: "d2",
        status: "fulfilled",
        requiredQuantity: 4,
        unit: "each",
        purchasingWeekStart: recent,
      },
      {
        _id: "d3",
        status: "superseded",
        requiredQuantity: 2,
        unit: "pound",
        purchasingWeekStart: recent,
      },
      {
        _id: "d4",
        status: "pending",
        requiredQuantity: 3,
        unit: "liter",
        purchasingWeekStart: recent,
      },
    ];
    const model = buildLiveReportModel("inventory", lines, "all_time");
    expect(kpiValue(model, "inventory.demand_lines")).toBe("4");
    expect(kpiValue(model, "inventory.confirmed")).toBe("1");
    expect(kpiValue(model, "inventory.fulfilled")).toBe("1");
    expect(kpiValue(model, "inventory.unresolved")).toBe("2");
    expect(model.kpis.map((kpi) => kpi.value).join(" ")).not.toMatch(/19/);
    expect(model.rows.map((row) => row.values.unit)).toEqual(
      lines.map((line) => line.unit),
    );
  });

  it("staffing: scheduled hours equal the timed shifts, untimed shifts are counted, not zero", () => {
    const shifts = [
      {
        _id: "s1",
        status: "scheduled",
        startsAt: recent,
        endsAt: recent + 6 * HOUR,
      },
      {
        _id: "s2",
        status: "completed",
        startsAt: recent,
        endsAt: recent + 2.5 * HOUR,
      },
      { _id: "s3", status: "scheduled", startsAt: recent },
    ];
    const model = buildLiveReportModel("workforce", shifts, "all_time");
    expect(kpiValue(model, "workforce.scheduled_hours")).toBe(
      "8.5 · 1 shift not timed",
    );
    expect(
      model.kpis.find((kpi) => kpi.metricId === "workforce.scheduled_hours")
        ?.rowIds,
    ).toEqual(["s1", "s2"]);
    const allTimed = buildLiveReportModel(
      "workforce",
      shifts.slice(0, 2),
      "all_time",
    );
    expect(kpiValue(allTimed, "workforce.scheduled_hours")).toBe("8.5");
  });

  it("recipe cost: a missing price keeps the cost incomplete with a coverage count", () => {
    const summary = calculateComponentCost({
      lines: [
        { id: "l1", ingredientId: "flour", quantity: 2, unit: "pound" },
        { id: "l2", ingredientId: "saffron", quantity: 1, unit: "gram" },
      ],
      ingredients: [
        { id: "flour", name: "Flour", unit: "pound", costPerUnit: 1.5 },
        { id: "saffron", name: "Saffron", unit: "gram", costPerUnit: 0 },
      ],
      batchMultiplier: 1,
      yieldQuantity: 4,
    });
    expect(summary.batchCost).toBe(3);
    expect(summary.isComplete).toBe(false);
    expect(summary.pricedLineCount).toBe(1);
    expect(summary.totalLineCount).toBe(2);
    expect(summary.lines.find((line) => line.lineId === "l2")?.status).toBe(
      "missing_price",
    );
  });

  it("food cost with no closeouts is unknown, never 0%", () => {
    expect(percentText(foodCostPercent([]))).toBe(NOT_KNOWN);
    expect(
      percentText(
        foodCostPercent([
          { grossProfit: 600, actualIngredientCost: 400 },
          { grossProfit: 300, actualIngredientCost: 200 },
        ]),
      ),
    ).toBe("40.0%");
  });
});
