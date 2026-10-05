/**
 * PL-PAYROLL (AC-130): repeated exports keep one person + pay period key; an
 * unchanged period is not sent again as new; an acknowledged period that is
 * later corrected goes out as a reconciling difference; a provider
 * rejection means the next export resends the full approved total.
 */
import { describe, expect, it } from "vitest";
import { buildPayrollExport } from "../../../src/features/finance/payrollExport";
import {
  payrollPeriodKey,
  planPayrollRevisions,
} from "../../../src/features/finance/payrollReconcile";

const at = (value: string) => new Date(value).getTime();
const period = { periodStart: "2026-03-02", periodEnd: "2026-03-08" };
const people = [
  { _id: "p-ada", givenName: "Ada", familyName: "Cook", employeeNumber: "1" },
];
const approved = (hours: number) => ({
  personId: "p-ada",
  clockInAt: at("2026-03-02T09:00:00"),
  clockOutAt: at("2026-03-02T09:00:00") + hours * 3_600_000,
  status: "closed",
  approvedAt: 1,
});
const exportOf = (hours: number) =>
  buildPayrollExport({
    processor: "gusto",
    ...period,
    people,
    timeRecords: [approved(hours)],
    payrollInputs: [],
  });
const total = (hours: number) => {
  const row = exportOf(hours).rows[0]!;
  return {
    personId: row.personId,
    totalMinutes: (row.regularHours + row.overtimeHours) * 60,
  };
};

describe("payroll export stability (AC-130)", () => {
  it("two exports of the same period keep identical person/period keys and an acknowledged-then-corrected period exports a reconciling delta", () => {
    // Same data exported twice: the same rows, CSV and key.
    expect(exportOf(5).csv).toBe(exportOf(5).csv);
    const first = planPayrollRevisions({
      rows: [total(5)],
      receipts: [],
      ...period,
    });
    expect(first[0]).toMatchObject({
      periodKey: payrollPeriodKey(
        "p-ada",
        period.periodStart,
        period.periodEnd,
      ),
      revision: 1,
      deltaMinutes: 300,
      changed: true,
    });
    const receipts = [{ ...first[0]!, status: "acknowledged" }];
    // Nothing changed: no new revision.
    expect(
      planPayrollRevisions({ rows: [total(5)], receipts, ...period })[0],
    ).toMatchObject({ revision: 1, deltaMinutes: 0, changed: false });

    // Corrected after the provider acknowledged: revision 2, +90 min.
    const corrected = planPayrollRevisions({
      rows: [total(6.5)],
      receipts,
      ...period,
    })[0]!;
    expect(corrected).toMatchObject({
      periodKey: first[0]!.periodKey,
      revision: 2,
      previousTotalMinutes: 300,
      deltaMinutes: 90,
      changed: true,
    });

    // The provider rejects revision 2: the approved time is untouched and
    // the next export sends revision 3 against the last accepted total.
    const afterReject = planPayrollRevisions({
      rows: [total(6.5)],
      receipts: [...receipts, { ...corrected, status: "rejected" }],
      ...period,
    })[0]!;
    expect(afterReject).toMatchObject({
      revision: 3,
      previousTotalMinutes: 300,
      deltaMinutes: 90,
      changed: true,
    });

    // Approval withdrawn by a correction: the person drops to zero and is
    // still sent as a -300 min difference.
    expect(
      planPayrollRevisions({ rows: [], receipts, ...period })[0],
    ).toMatchObject({
      personId: "p-ada",
      revision: 2,
      totalMinutes: 0,
      deltaMinutes: -300,
      changed: true,
    });
  });
  it("a file for a different payroll provider is a new send with its own receipt", () => {
    const periodKey = payrollPeriodKey(
      "p-ada",
      period.periodStart,
      period.periodEnd,
    );
    const sentToGusto = {
      personId: "p-ada",
      periodKey,
      revision: 1,
      totalMinutes: 300,
      status: "accepted",
      processor: "gusto",
    };
    const sameProvider = planPayrollRevisions({
      rows: [total(5)],
      receipts: [sentToGusto],
      ...period,
      processor: "gusto",
    });
    expect(sameProvider[0]).toMatchObject({ changed: false, revision: 1 });
    const toAdp = planPayrollRevisions({
      rows: [total(5)],
      receipts: [sentToGusto],
      ...period,
      processor: "adp",
    });
    expect(toAdp[0]).toMatchObject({ changed: true, revision: 2 });
  });
});
