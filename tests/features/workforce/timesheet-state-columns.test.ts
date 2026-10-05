// @vitest-environment jsdom
/**
 * PL-PAYROLL (AC-519): each time sheet row shows where the clock-in came
 * from, the unpaid lunch and paid breaks, approval, and whether the hours
 * went to payroll.
 */
import { createElement } from "react";
import { expect, it } from "vitest";
import { backend, container, mount } from "../../support/mounted-app";
import { TimeSheetPage } from "../../../src/features/workforce/TimeSheetPage";

const IN = new Date("2026-03-03T09:00:00").getTime();
const OUT = new Date("2026-03-03T14:00:00").getTime();

it("each timesheet row shows punch evidence, break minutes, and approval state", async () => {
  backend.values.set("useListPerson", [
    { _id: "p-ada", givenName: "Ada", familyName: "Cook", status: "active" },
  ]);
  backend.values.set("useListTimeRecord", [
    {
      _id: "t-sent",
      personId: "p-ada",
      status: "closed",
      version: 3,
      clockInAt: IN,
      clockOutAt: OUT,
      breakMinutes: 30,
      paidBreakMinutes: 15,
      approvedAt: OUT,
      timeZone: "America/New_York",
      clockInLatitude: 40.71281,
      clockInLongitude: -74.00602,
      clockInAccuracyMeters: 12,
    },
    {
      _id: "t-not-sent",
      personId: "p-ada",
      status: "closed",
      version: 3,
      clockInAt: IN + 7 * 86_400_000,
      clockOutAt: OUT + 7 * 86_400_000,
      approvedAt: OUT,
    },
  ]);
  backend.values.set("useListPayrollExportRecord", [
    {
      _id: "r1",
      personId: "p-ada",
      periodKey: "p-ada|2026-03-02|2026-03-08",
      revision: 2,
      totalMinutes: 270,
      deltaMinutes: 0,
      status: "acknowledged",
    },
  ]);
  await mount(createElement(TimeSheetPage));
  const rows = [...container.querySelectorAll("tbody tr")];
  const sent = rows.find((row) => row.textContent?.includes("Phone location"));
  expect(sent?.textContent).toContain(
    "Phone location 40.7128, -74.0060 (±12 m) · America/New York",
  );
  expect(sent?.textContent).toContain("30 min");
  expect(sent?.textContent).toContain("15 min paid breaks");
  expect(sent?.textContent).toContain("Approved for payroll");
  // "Sent to payroll" waits until each receipt records the exact entries its
  // file carried (release review 2026-09-29): the time sheet does not guess.
  expect(container.textContent).not.toContain("Sent to payroll");
});
