/**
 * PL-TIME (AC-502, spec §12.2 / §15.4): lunch is unpaid, other defined
 * breaks stay paid; payroll takes only approved time and splits hours past
 * 40 in a week into overtime.
 */
import { describe, expect, it } from "vitest";
import { buildPayrollExport } from "../../../src/features/finance/payrollExport";
import {
  approvedPayroll,
  overtimeWarnings,
  paidMinutes,
} from "../../../src/features/workforce/timePay";

const at = (value: string) => new Date(value).getTime();

describe("break classification", () => {
  it("an unpaid lunch subtracts from paid minutes while a paid break does not", () => {
    const base = {
      personId: "p1",
      clockInAt: at("2026-03-02T09:00:00"),
      clockOutAt: at("2026-03-02T17:00:00"),
      status: "closed",
      approvedAt: at("2026-03-02T18:00:00"),
    };
    // 8 hours, no breaks.
    expect(paidMinutes(base)).toBe(480);
    // 30 minute lunch comes off.
    expect(paidMinutes({ ...base, breakMinutes: 30 })).toBe(450);
    // Two 15 minute paid breaks change nothing.
    expect(paidMinutes({ ...base, paidBreakMinutes: 30 })).toBe(480);
    expect(
      paidMinutes({ ...base, breakMinutes: 30, paidBreakMinutes: 30 }),
    ).toBe(450);

    // The payroll export uses the same rule.
    const document = buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-03-02",
      periodEnd: "2026-03-02",
      people: [
        { _id: "p1", givenName: "Pat", familyName: "Pay", employeeNumber: "7" },
      ],
      timeRecords: [{ ...base, breakMinutes: 30, paidBreakMinutes: 30 }],
      payrollInputs: [],
    });
    expect(document.rows[0]?.recordedHours).toBe(7.5);
  });

  it("payroll counts only approved time and names what still waits", () => {
    const day = {
      personId: "p1",
      clockInAt: at("2026-03-03T09:00:00"),
      clockOutAt: at("2026-03-03T13:00:00"),
      status: "closed",
    };
    const result = approvedPayroll(
      [
        { ...day, approvedAt: at("2026-03-03T14:00:00"), breakMinutes: 0 },
        {
          ...day,
          clockInAt: at("2026-03-04T09:00:00"),
          clockOutAt: at("2026-03-04T13:00:00"),
        },
      ],
      "p1",
      at("2026-03-02T00:00:00"),
      at("2026-03-09T00:00:00"),
    );
    expect(result).toEqual({
      approvedMinutes: 240,
      regularMinutes: 240,
      overtimeMinutes: 0,
      approvedCount: 1,
      waitingApprovalCount: 1,
      approvedIds: [],
    });
    const document = buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-03-03",
      periodEnd: "2026-03-04",
      people: [],
      timeRecords: [
        day,
        { ...day, clockInAt: at("2026-03-04T09:00:00"), approvedAt: 1 },
      ].map((row) => ({ ...row, clockOutAt: row.clockInAt + 4 * 3_600_000 })),
      payrollInputs: [],
    });
    expect(document.rows[0]?.recordedHours).toBe(4);
  });

  it("hours past 40 in one week are overtime and raise a warning", () => {
    const records = [0, 1, 2, 3, 4].map((offset) => ({
      personId: "p1",
      clockInAt: at(`2026-03-0${2 + offset}T08:00:00`),
      clockOutAt: at(`2026-03-0${2 + offset}T18:00:00`),
      breakMinutes: 30,
      status: "closed",
      approvedAt: 1,
    }));
    // 5 × (10h - 30 min lunch) = 47.5 h.
    const result = approvedPayroll(
      records,
      "p1",
      at("2026-03-02T00:00:00"),
      at("2026-03-09T00:00:00"),
    );
    expect(result.approvedMinutes).toBe(2850);
    expect(result.regularMinutes).toBe(2400);
    expect(result.overtimeMinutes).toBe(450);
    expect(overtimeWarnings(records)).toEqual([
      expect.objectContaining({
        personId: "p1",
        hours: 47.5,
        overtimeHours: 7.5,
      }),
    ]);
  });
});
