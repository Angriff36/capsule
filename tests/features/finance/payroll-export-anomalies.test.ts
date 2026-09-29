/**
 * PL-PAYROLL (AC-128): payroll uses approved actual time; overlapping
 * entries, missing rates, entries waiting for approval and people still
 * clocked in are named on the row; a change after export is a new, numbered
 * revision with its difference, not a silent rewrite.
 */
import { describe, expect, it } from "vitest";
import { buildPayrollExport } from "../../../src/features/finance/payrollExport";
import {
  payrollPeriodKey,
  planPayrollRevisions,
} from "../../../src/features/finance/payrollReconcile";

const at = (value: string) => new Date(value).getTime();
const people = [
  { _id: "p-ada", givenName: "Ada", familyName: "Cook", employeeNumber: "1" },
  { _id: "p-bo", givenName: "Bo", familyName: "Wait", employeeNumber: "2" },
];
const entry = (from: string, to: string, over: object = {}) => ({
  personId: "p-ada",
  clockInAt: at(from),
  clockOutAt: at(to),
  breakMinutes: 0,
  status: "closed",
  approvedAt: 1,
  ...over,
});

describe("payroll export anomalies (AC-128)", () => {
  it("overlapping ready records and missing rates surface as explicit row warnings and a post-export correction produces a new identified revision", () => {
    const document = buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
      people,
      timeRecords: [
        entry("2026-03-02T09:00:00", "2026-03-02T13:00:00"),
        // Overlaps the first entry by an hour.
        entry("2026-03-02T12:00:00", "2026-03-02T15:00:00"),
        // Finished but not approved: not counted, named.
        entry("2026-03-03T09:00:00", "2026-03-03T11:00:00", {
          approvedAt: null,
        }),
        // Bo only has unapproved time: no row, but named.
        entry("2026-03-03T09:00:00", "2026-03-03T11:00:00", {
          personId: "p-bo",
          approvedAt: null,
        }),
      ],
      payrollInputs: [],
      hourlyRateByPersonId: new Map([["p-ada", null]]),
    });
    const ada = document.rows.find((row) => row.personId === "p-ada")!;
    // Approved actual time only: 4 h + 3 h, never planned hours.
    expect(ada.recordedHours).toBe(7);
    expect(ada.warnings).toEqual([
      "1 approved time entry overlaps another — check before sending, or the hours count twice.",
      "1 time entry is not approved yet and not in this total.",
      "No hourly rate on file — pay can't be estimated.",
    ]);
    expect(document.waitingOnlyNames).toEqual(["Bo Wait"]);

    // Sent once; then a manager corrects Ada's time down by an hour.
    const receipts = [
      {
        personId: "p-ada",
        periodKey: payrollPeriodKey("p-ada", "2026-03-02", "2026-03-08"),
        revision: 1,
        totalMinutes: 420,
        status: "acknowledged",
      },
    ];
    const plan = planPayrollRevisions({
      rows: [{ personId: "p-ada", totalMinutes: 360 }],
      receipts,
      periodStart: "2026-03-02",
      periodEnd: "2026-03-08",
    });
    expect(plan).toEqual([
      {
        personId: "p-ada",
        periodKey: "p-ada|2026-03-02|2026-03-08",
        revision: 2,
        totalMinutes: 360,
        previousTotalMinutes: 420,
        deltaMinutes: -60,
        changed: true,
      },
    ]);
  });
});
