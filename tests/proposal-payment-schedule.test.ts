import { describe, expect, it } from "vitest";
import {
  frozenPaymentSchedule,
  paymentScheduleLines,
  proposalPaymentSchedule,
} from "../src/lib/proposalPaymentSchedule";

const DAY = 24 * 60 * 60_000;
const date = (at: number) => new Date(at).toISOString().slice(0, 10);

describe("AC-654 proposal payment schedule", () => {
  it("is absent until a deposit or balance day is set", () => {
    expect(proposalPaymentSchedule({ total: 1000 })).toBeNull();
  });

  it("splits the total in whole cents so deposit + balance is the total", () => {
    const schedule = proposalPaymentSchedule({
      total: 1234.57,
      depositPercent: 33,
      balanceDueDaysBefore: 14,
      eventDate: Date.UTC(2027, 5, 20, 12),
    })!;
    expect(schedule.depositAmount).toBe(407.41);
    expect(schedule.balanceAmount).toBe(827.16);
    expect(
      Math.round((schedule.depositAmount + schedule.balanceAmount) * 100),
    ).toBe(123457);
    expect(schedule.balanceDueAt).toBe(Date.UTC(2027, 5, 20, 12) - 14 * DAY);
  });

  it("reads as plain rows: deposit at acceptance, balance before the event", () => {
    const schedule = proposalPaymentSchedule({
      total: 2000,
      depositPercent: 50,
      balanceDueDaysBefore: 1,
      eventDate: Date.UTC(2027, 5, 20, 12),
    })!;
    expect(paymentScheduleLines(schedule, date)).toEqual([
      { label: "Deposit (50%)", amount: 1000, due: "Due when you accept" },
      {
        label: "Balance",
        amount: 1000,
        due: "Due 1 day before the event (2027-06-19)",
      },
    ]);
  });

  it("with no deposit, the full amount is due on the event day", () => {
    const schedule = proposalPaymentSchedule({
      total: 500,
      balanceDueDaysBefore: 0,
    })!;
    expect(paymentScheduleLines(schedule, date)).toEqual([
      { label: "Full amount", amount: 500, due: "Due on the event day" },
    ]);
  });

  it("reads a frozen copy back and ignores anything else", () => {
    const schedule = proposalPaymentSchedule({
      total: 800,
      depositPercent: 25,
    });
    expect(frozenPaymentSchedule(JSON.parse(JSON.stringify(schedule)))).toEqual(
      schedule,
    );
    expect(frozenPaymentSchedule(undefined)).toBeNull();
    expect(frozenPaymentSchedule({ depositAmount: "x" })).toBeNull();
  });
});
