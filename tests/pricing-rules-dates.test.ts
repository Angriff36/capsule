import { describe, expect, it } from "vitest";
import {
  cateringMinimumFor,
  parseHolidayDate,
  parseMonthDay,
  readPricingRules,
} from "../src/lib/pricingRules";

describe("price rule dates are real calendar dates", () => {
  it("accepts real month-days and refuses days a month does not have", () => {
    expect(parseMonthDay("5-1")).toBe("05-01");
    expect(parseMonthDay("02-29")).toBe("02-29");
    expect(parseMonthDay("04-30")).toBe("04-30");
    expect(parseMonthDay("12-31")).toBe("12-31");
    for (const bad of ["02-30", "02-31", "04-31", "06-31", "09-31", "11-31"])
      expect(parseMonthDay(bad)).toBeNull();
    for (const bad of ["00-10", "13-01", "05-00", "05-32", "May 1", ""])
      expect(parseMonthDay(bad)).toBeNull();
  });

  it("checks one-year holidays against that year's calendar", () => {
    expect(parseHolidayDate("12-24")).toBe("12-24");
    expect(parseHolidayDate("2028-02-29")).toBe("2028-02-29");
    expect(parseHolidayDate("2026-11-26")).toBe("2026-11-26");
    expect(parseHolidayDate("2026-4-30")).toBe("2026-04-30");
    for (const bad of ["2027-02-29", "2026-02-30", "2026-04-31", "04-31"])
      expect(parseHolidayDate(bad)).toBeNull();
  });

  it("drops impossible saved dates and keeps the real ones", () => {
    const rules = readPricingRules({
      pricingRulesJson: JSON.stringify({
        peakSeasons: [
          { from: "05-01", to: "10-31" },
          { from: "04-31", to: "06-30" },
          { from: "02-01", to: "02-30" },
        ],
        holidays: [
          { date: "12-24", label: "Christmas Eve", amount: 5000 },
          { date: "2027-02-29", label: "Never", amount: 9000 },
          { date: "02-31", label: "Never", amount: 9000 },
          { date: "2026-11-26", label: "Thanksgiving", amount: 6000 },
        ],
      }),
    });
    expect(rules.peakSeasons).toEqual([{ from: "05-01", to: "10-31" }]);
    expect(rules.holidays.map((row) => row.date)).toEqual([
      "12-24",
      "2026-11-26",
    ]);
    expect(
      cateringMinimumFor(rules, new Date(2026, 10, 26).getTime(), false),
    ).toEqual({ amount: 6000, reason: "Thanksgiving" });
  });
});
