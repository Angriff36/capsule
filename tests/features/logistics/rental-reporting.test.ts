/**
 * AC-552 (BE-13-gs-reporting): rental revenue, vendor cost, loss/damage and
 * equipment use roll up per month; unknown prices and costs are counted, not
 * read as zero.
 */
import { describe, expect, it } from "vitest";
import { rentalReport } from "../../../src/features/logistics/rentalReporting";
import {
  rentalReportCsv,
  rentalReportRows,
} from "../../../src/features/facilities/RentalReportCard";

const HOUR = 3_600_000;
const MAY = Date.UTC(2026, 4, 1);
const JUNE = Date.UTC(2026, 5, 1);
const at = (day: number, hour = 0) => Date.UTC(2026, 4, day, hour);

const input = {
  events: [
    { _id: "gala", stage: "approved", startsAt: at(10, 17) },
    { _id: "picnic", stage: "final", startsAt: at(20, 12) },
    { _id: "dropped", stage: "cancelled", startsAt: at(21, 12) },
    { _id: "june", stage: "approved", startsAt: JUNE + HOUR },
  ],
  equipment: [
    {
      _id: "chairs",
      name: "Chairs",
      ownership: "owned",
      quantity: 100,
      status: "active",
      customerPrice: 4,
    },
    {
      _id: "urns",
      name: "Coffee urns",
      ownership: "owned",
      quantity: 2,
      status: "active",
    },
    {
      _id: "tent",
      name: "Tent",
      ownership: "rented",
      quantity: 1,
      status: "active",
      customerPrice: 900,
    },
  ],
  holds: [
    // 50 chairs for 31 days' worth of hours / 2 -> see use below.
    {
      equipmentId: "chairs",
      eventId: "gala",
      quantity: 50,
      status: "reserved",
      startsAt: at(10, 0),
      endsAt: at(10, 0) + 372 * HOUR,
    },
    {
      equipmentId: "urns",
      eventId: "picnic",
      quantity: 1,
      status: "checked_out",
      startsAt: at(20, 0),
      endsAt: at(20, 0) + 24 * HOUR,
    },
    {
      equipmentId: "tent",
      eventId: "picnic",
      quantity: 1,
      status: "reserved",
      startsAt: at(20, 0),
      endsAt: at(21, 0),
    },
    {
      equipmentId: "chairs",
      eventId: "dropped",
      quantity: 80,
      status: "reserved",
      startsAt: at(21, 0),
      endsAt: at(22, 0),
    },
    {
      equipmentId: "chairs",
      eventId: "gala",
      quantity: 10,
      status: "cancelled",
      startsAt: at(10, 0),
      endsAt: at(11, 0),
    },
  ],
  lines: [
    { eventId: "picnic", vendorCost: 650, status: "returned" },
    { eventId: "gala", vendorCost: 125.5, status: "confirmed" },
    { eventId: "gala", vendorCost: 300, status: "cancelled" },
    { eventId: "june", vendorCost: 999, status: "requested" },
  ],
  issues: [
    {
      kind: "damaged",
      quantity: 2,
      raisedAt: at(11),
      cost: 56,
      payer: "client",
      chargeAmount: 56,
    },
    { kind: "missing", quantity: 1, raisedAt: at(21), payer: "undecided" },
    {
      kind: "cleaning",
      quantity: 5,
      raisedAt: at(21),
      cost: 20,
      payer: "company",
    },
    {
      kind: "missing",
      quantity: 3,
      raisedAt: JUNE + HOUR,
      cost: 90,
      payer: "vendor",
      chargeAmount: 90,
    },
  ],
};

describe("rental and equipment roll-up for a month", () => {
  it("adds up charges, vendor cost, loss and use, and counts the unknowns", () => {
    const report = rentalReport(input, MAY, JUNE);
    expect(report).toMatchObject({
      equipmentCharged: 50 * 4 + 900, // chairs at the gala + the tent; urns unpriced
      unpricedHolds: 1,
      vendorCost: 775.5, // cancelled and June lines out
      vendorLines: 2,
      lostOrDamagedUnits: 3, // cleaning and June out
      lossCost: 56,
      lossCostUnknown: 1,
      recovered: 56,
    });
    // Chairs: 50 of 100 out for 372 of 744 May hours = 25%; urns 1 of 2 for
    // 24 hours = 24/1488; the cancelled event's and cancelled holds don't count.
    const chairs = report.busiest.find((row) => row.equipmentId === "chairs");
    expect(chairs?.share).toBeCloseTo(0.25, 5);
    const urns = report.busiest.find((row) => row.equipmentId === "urns");
    expect(urns?.share).toBeCloseTo(24 / 1488, 5);
    expect(report.busiest.map((row) => row.equipmentId)).not.toContain("tent");
  });

  it("prints the unknowns in words", () => {
    const rows = rentalReportRows(rentalReport(input, MAY, JUNE));
    const text = rows.map((row) => row.join(" | ")).join("\n");
    expect(text).toContain(
      "1 hold(s) on items with no client price - not counted.",
    );
    expect(text).toContain("1 problem(s) with no cost on file - not counted.");
    expect(text).toContain("Busiest: Chairs 25%");
  });

  it("uses the price the client accepted for an event that has one", () => {
    // The picnic's accepted proposal sold the tent and urn for 1,050; its
    // holds (tent at list 900, unpriced urn) no longer count. Cancelled and
    // June events' sales stay out.
    const report = rentalReport(
      {
        ...input,
        sales: [
          { eventId: "picnic", amount: 1050 },
          { eventId: "dropped", amount: 400 },
          { eventId: "june", amount: 700 },
        ],
      },
      MAY,
      JUNE,
    );
    expect(report).toMatchObject({
      equipmentCharged: 50 * 4 + 1050,
      soldEvents: 1,
      unpricedHolds: 0,
    });
    const text = rentalReportRows(report)
      .map((row) => row.join(" | "))
      .join("\n");
    expect(text).toContain(
      "1 event(s) at the price the client accepted; others at list price.",
    );
  });

  it("downloads the month as a spreadsheet file with plain numbers and every owned item", () => {
    const csv = rentalReportCsv(rentalReport(input, MAY, JUNE), "2026-05");
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe('"Month","Measure","Amount","Note"');
    expect(lines).toContain(
      '"2026-05","Equipment charged to clients",1100,"At list price for what is held. 1 hold(s) on items with no client price - not counted."',
    );
    expect(lines).toContain(
      '"2026-05","Vendor rental cost",775.5,"2 rental line(s) from vendors."',
    );
    expect(lines).toContain('"2026-05","Lost or damaged cost",56,""');
    expect(lines).toContain('"2026-05","Chairs",25,""');
    expect(lines).toContain('"2026-05","Coffee urns",1.6,""');
    expect(csv).not.toContain("Tent"); // rented, not ours
  });
});
