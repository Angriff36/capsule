/**
 * AC-517: a shift row shows the planned window beside the recorded time, for
 * the worker (My Day past shifts) and the manager (time sheet).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MyPastShiftsCard } from "../../../src/features/staff/MyPastShiftsCard";
import { plannedComparison } from "../../../src/features/staff/workedShifts";
import { PlannedVsRecorded } from "../../../src/features/workforce/TimeSheetPage";
import { formatTime } from "../../../src/lib/format";

const START = Date.parse("2026-10-18T17:00:00Z");
const HOUR = 3_600_000;
const planned = { startsAt: START, endsAt: START + 5 * HOUR };

describe("recorded against planned (AC-517)", () => {
  it("says how recorded time compares with the plan", () => {
    expect(plannedComparison({ hours: 5 }, planned)).toBe("As planned");
    expect(plannedComparison({ hours: 5.25 }, planned)).toBe(
      "15 min longer than planned",
    );
    expect(plannedComparison({ hours: 3.5 }, planned)).toBe(
      "1.5 h shorter than planned",
    );
    expect(plannedComparison({ hours: 5 }, null)).toBeNull();
  });

  it("a shift row shows planned window beside recorded punch totals", () => {
    const worker = renderToStaticMarkup(
      createElement(MyPastShiftsCard, {
        records: [
          {
            _id: "t1",
            shiftId: "s1",
            eventId: "e1",
            clockInAt: START + 10 * 60_000,
            clockOutAt: START + 6 * HOUR,
            breakMinutes: 30,
            status: "closed",
          },
        ],
        eventTitle: () => "Harbor dinner",
        plannedFor: (id) => (id === "s1" ? planned : null),
      }),
    );
    expect(worker).toContain("5.3 h");
    expect(worker).toContain(
      `Planned ${formatTime(planned.startsAt)} – ${formatTime(planned.endsAt)}`,
    );
    expect(worker).toContain("20 min longer than planned");

    const manager = renderToStaticMarkup(
      createElement(PlannedVsRecorded, {
        row: {
          clockInAt: START,
          clockOutAt: START + 4 * HOUR,
          breakMinutes: 0,
        },
        planned,
      }),
    );
    expect(manager).toContain("1 h shorter than planned");
  });
});
