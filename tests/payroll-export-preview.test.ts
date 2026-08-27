import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PayrollPreparePayloadBuilder } from "../src/features/finance/PayrollPreparePayloadBuilder";
import {
  buildPayrollExport,
  payrollCsvDownloadAllowed,
} from "../src/features/finance/payrollExport";
import {
  clockedMinutesForPerson,
  dayEndExclusiveOfTimestamp,
  dayStartOfTimestamp,
  roundPayrollHours,
} from "../src/features/finance/payrollPeriod";

const JOSH_ID = "r575kbeeskh50kx33x4qt9sb918b6nbb";
const RYAN_ID = "r57bb5bda84v2m4fb1yjxva6xs8bbphg";

const jan9Start = new Date("2026-01-09T09:00:00").getTime();
const jan9End = new Date("2026-01-09T14:00:00").getTime();

const people = [
  {
    _id: JOSH_ID,
    givenName: "Josh",
    familyName: "Mitchell",
  },
  {
    _id: RYAN_ID,
    givenName: "Ryan",
    familyName: "Ostwind",
    employeeNumber: "EMP-104",
  },
];

const fiveHourRecord = {
  personId: JOSH_ID,
  clockInAt: jan9Start,
  clockOutAt: jan9End,
  breakMinutes: 0,
  status: "closed",
};

const zeroMinutePrepared = {
  personId: JOSH_ID,
  periodStart: new Date("2026-01-09T00:00:00").getTime(),
  periodEnd: new Date("2026-01-09T00:00:00").getTime(),
  regularMinutes: 0,
  overtimeMinutes: 0,
  status: "prepared",
};

describe("payroll export identity", () => {
  it("never uses a Capsule person _id as the employee number", () => {
    const document = buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-01-09",
      periodEnd: "2026-01-09",
      people,
      timeRecords: [fiveHourRecord],
      payrollInputs: [],
    });

    expect(document.rows).toHaveLength(1);
    expect(document.rows[0]?.employeeName).toBe("Josh Mitchell");
    expect(document.rows[0]?.employeeId).toBe("");
    expect(document.rows[0]?.missingEmployeeNumber).toBe(true);
    expect(document.rows[0]?.employeeId).not.toBe(JOSH_ID);
    expect(document.rows[0]?.employeeId).not.toMatch(/^r57/);
    expect(document.csv).not.toContain(JOSH_ID);
    expect(document.csv).not.toContain(JOSH_ID.slice(0, 8));
    expect(payrollCsvDownloadAllowed(document)).toBe(false);
  });

  it("puts a real employee number in the CSV and allows download", () => {
    const document = buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-01-09",
      periodEnd: "2026-01-09",
      people,
      timeRecords: [
        {
          personId: RYAN_ID,
          clockInAt: jan9Start,
          clockOutAt: new Date("2026-01-09T09:15:00").getTime(),
          breakMinutes: 0,
          status: "closed",
        },
      ],
      payrollInputs: [],
    });

    expect(document.rows[0]?.employeeId).toBe("EMP-104");
    expect(document.csv).toContain("EMP-104");
    expect(document.csv).not.toContain(RYAN_ID);
    expect(payrollCsvDownloadAllowed(document)).toBe(true);
  });
});

describe("payroll hours match preview", () => {
  it("counts a full Jan 9 shift as 5.00 h even when a prepared input stored 0", () => {
    const document = buildPayrollExport({
      processor: "gusto",
      periodStart: "2026-01-09",
      periodEnd: "2026-01-09",
      people,
      timeRecords: [fiveHourRecord],
      payrollInputs: [zeroMinutePrepared],
    });

    expect(document.rows[0]?.recordedHours).toBe(5);
    expect(document.rows[0]?.regularHours).toBe(5);

    const clocked = clockedMinutesForPerson(
      [fiveHourRecord],
      JOSH_ID,
      dayStartOfTimestamp(zeroMinutePrepared.periodStart),
      dayEndExclusiveOfTimestamp(zeroMinutePrepared.periodEnd),
    );
    expect(roundPayrollHours(clocked)).toBe(5);
    expect(clocked).toBe(300);
  });

  it("prepares a date-only Jan 9 → Jan 9 window that covers the 5.00 h shift", () => {
    const data = new FormData();
    data.set("personId", JOSH_ID);
    data.set("periodStart", "2026-01-09");
    data.set("periodEnd", "2026-01-09");
    data.set("regularMinutes", "300");
    data.set("overtimeMinutes", "0");
    const payload = new PayrollPreparePayloadBuilder().fromForm(data);

    expect(payload.periodStart).toBe(dayStartOfTimestamp(jan9Start));
    expect(payload.periodEnd).toBeGreaterThan(jan9End);
    expect(payload.regularMinutes).toBe(300);
  });
});

describe("preview source contract — no raw _id slices", () => {
  const root = process.cwd();
  const panel = readFileSync(
    join(root, "src/features/finance/PayrollExportPanel.tsx"),
    "utf8",
  );
  const exportSource = readFileSync(
    join(root, "src/features/finance/payrollExport.ts"),
    "utf8",
  );
  const page = readFileSync(
    join(root, "src/features/finance/PayrollPage.tsx"),
    "utf8",
  );

  it("never falls back to the Capsule person _id for employeeId", () => {
    expect(exportSource).not.toMatch(/employeeNumber\s*\|\|\s*entry\.personId/);
    expect(exportSource).not.toMatch(/employeeId:\s*employeeNumber\s*\|\|/);
    expect(exportSource).not.toMatch(/usesFallbackEmployeeId/);
    expect(panel).not.toMatch(/fallbackEmployeeIdCount/);
    expect(page).not.toMatch(/fallbackEmployeeIdCount/);
  });

  it("fails if the preview still prints _id slices or a raw employeeId", () => {
    expect(panel).not.toMatch(/_id\.slice/);
    expect(panel).not.toMatch(/personId\.slice/);
    expect(panel).toContain("missingEmployeeNumber");
    expect(panel).toContain("PersonEmployeeNumberField");
    expect(panel).toContain("No hourly rate set");
    expect(panel).toContain("payrollCsvDownloadAllowed");
    // Missing numbers get an in-place Set field — never a raw _id under the name.
    expect(panel).toMatch(
      /missingEmployeeNumber \?[\s\S]*PersonEmployeeNumberField[\s\S]*:\s*\([\s\S]*row\.employeeId/,
    );
  });
});
