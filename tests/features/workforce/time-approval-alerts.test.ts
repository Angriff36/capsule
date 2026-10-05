// @vitest-environment jsdom
/**
 * PL-TIME (AC-509) time sheet: finished entries wait for approval and can be
 * approved one by one or all at once; a correction needs a reason and says
 * who changed it; the manager sees late / no-show alerts with Mark no-show.
 */
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  input,
  mount,
} from "../../support/mounted-app";
import { TimeSheetPage } from "../../../src/features/workforce/TimeSheetPage";

const IN = Date.UTC(2026, 8, 8, 13);
const OUT = Date.UTC(2026, 8, 8, 18);

function seed() {
  backend.values.set("useListPerson", [
    { _id: "p-ada", givenName: "Ada", familyName: "Cook", status: "active" },
    { _id: "p-mo", givenName: "Mo", familyName: "Boss", status: "active" },
  ]);
  backend.values.set("useListShift", [
    { _id: "shift-lou", personId: "p-ada", status: "scheduled", version: 3 },
  ]);
  backend.values.set("useListTimeRecord", [
    {
      _id: "t-1",
      personId: "p-ada",
      status: "closed",
      version: 2,
      clockInAt: IN,
      clockOutAt: OUT,
      breakMinutes: 30,
      paidBreakMinutes: 15,
    },
    {
      _id: "t-2",
      personId: "p-ada",
      status: "corrected",
      version: 5,
      clockInAt: IN - 86_400_000,
      clockOutAt: OUT - 86_400_000,
      approvedAt: OUT,
      correctionReason: "Left at six, not five",
      correctedById: "p-mo",
    },
  ]);
  backend.values.set("laborSummary:attendanceAlerts", {
    alerts: [
      {
        kind: "late",
        personId: "p-ada",
        shiftId: "shift-x",
        amount: 25,
        recorded: false,
        personName: "Ada Cook",
      },
      {
        kind: "no_show",
        personId: "p-ada",
        shiftId: "shift-lou",
        amount: 0,
        recorded: false,
        personName: "Lou Crew",
      },
    ],
    overtime: [
      {
        personId: "p-ada",
        weekStartsAt: IN,
        hours: 44,
        overtimeHours: 4,
        personName: "Ada Cook",
      },
    ],
  });
}

it("shows approval state, lunch vs paid breaks, and who changed an entry", async () => {
  seed();
  await mount(createElement(TimeSheetPage));
  const text = container.textContent ?? "";
  expect(text).toContain("Waiting for approval");
  expect(text).toContain("Approved for payroll");
  expect(text).toContain("Changed by Mo Boss: Left at six, not five");
  expect(text).toContain("15 min paid breaks");

  const approve = command("useTimeRecordApprove");
  await click(button("Approve"));
  expect(approve).toHaveBeenCalledExactlyOnceWith({ docId: "t-1", version: 2 });
  await click(button("Approve 1 finished entry"));
  expect(approve).toHaveBeenLastCalledWith({ docId: "t-1", version: 2 });
});

it("a correction asks why and sends the reason with the breaks", async () => {
  seed();
  await mount(createElement(TimeSheetPage));
  const correct = command("useTimeRecordCorrect");
  const correctButtons = [...container.querySelectorAll("button")].filter(
    (node) => node.textContent?.trim() === "Correct",
  );
  await click(correctButtons[0]!);
  expect(button("Save correction").disabled).toBe(true);
  input("reason", " Forgot to clock out ");
  await click(button("Save correction"));
  expect(correct).toHaveBeenCalledTimes(1);
  expect(correct.mock.calls[0]![0]).toMatchObject({
    reason: "Forgot to clock out",
  });
});

it("lists late, no-show and overtime alerts and records a no-show", async () => {
  seed();
  await mount(createElement(TimeSheetPage));
  const panel = container.querySelector('[data-testid="time-attention"]');
  expect(panel?.textContent).toContain("Ada Cook clocked in 25 min late.");
  expect(panel?.textContent).toContain(
    "Lou Crew never clocked in for this shift.",
  );
  expect(panel?.textContent).toContain("4 hours over 40 are overtime");
  const noShow = command("useShiftMarkNoShow");
  await click(button("Mark no-show"));
  expect(noShow).toHaveBeenCalledExactlyOnceWith({
    docId: "shift-lou",
    version: 3,
  });
});
