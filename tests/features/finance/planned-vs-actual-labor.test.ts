/**
 * PL-PAYROLL (AC-510): planned labor (committed shifts × rate) against
 * actual labor (finished time less unpaid lunch × rate) for one event; a
 * person with no rate is listed and their minutes stay unpriced, never $0.
 */
import { describe, expect, it } from "vitest";
import { plannedVsActualLabor } from "../../../src/features/finance/laborCost";

const H = 3_600_000;
const START = Date.UTC(2026, 9, 18, 16);

describe("planned vs actual labor (AC-510)", () => {
  it("planned labor from shifts x rates compares against actual clocked labor with missing rates shown honestly", () => {
    const people = new Map([
      ["p-ada", { name: "Ada Cook", hourlyRate: 20 }],
      ["p-bo", { name: "Bo New", hourlyRate: null }],
    ]);
    const result = plannedVsActualLabor({
      eventId: "e1",
      people,
      shifts: [
        {
          personId: "p-ada",
          eventId: "e1",
          startsAt: START,
          endsAt: START + 5 * H,
          status: "scheduled",
        },
        {
          personId: "p-bo",
          eventId: "e1",
          startsAt: START,
          endsAt: START + 4 * H,
          status: "completed",
        },
        // Other event and cancelled shifts do not count.
        {
          personId: "p-ada",
          eventId: "e2",
          startsAt: START,
          endsAt: START + 9 * H,
          status: "scheduled",
        },
        {
          personId: "p-ada",
          eventId: "e1",
          startsAt: START,
          endsAt: START + 9 * H,
          status: "cancelled",
        },
      ],
      records: [
        // Ada stayed 6 h with a 30 min unpaid lunch = 5.5 h.
        {
          personId: "p-ada",
          clockInAt: START,
          clockOutAt: START + 6 * H,
          breakMinutes: 30,
          paidBreakMinutes: 15,
          status: "closed",
        },
        {
          personId: "p-bo",
          clockInAt: START,
          clockOutAt: START + 4 * H,
          status: "corrected",
        },
        // Still clocked in: not actual yet.
        { personId: "p-ada", clockInAt: START, status: "open" },
      ],
    });
    expect(result).toEqual({
      plannedMinutes: 540,
      plannedCost: 100,
      plannedShiftCount: 2,
      actualMinutes: 570,
      actualCost: 110,
      actualRecordCount: 2,
      varianceCost: 10,
      unpricedPlannedMinutes: 240,
      unpricedActualMinutes: 240,
      peopleMissingRates: ["Bo New"],
    });
  });
});
