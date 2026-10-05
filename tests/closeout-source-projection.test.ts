import { describe, expect, it } from "vitest";
import {
  closeoutCaptureValues,
  projectCloseoutSources,
  type CloseoutProjectionInput,
} from "../src/lib/closeoutSourceProjection";

// PL-CLOSEOUT (AC-625 / AC-628): the rules of each closeout line.

function input(
  overrides: Partial<CloseoutProjectionInput> = {},
): CloseoutProjectionInput {
  return {
    event: { quotedPrice: 5000, budgetAmount: 3000, expectedHeadcount: 50 },
    invoices: [],
    payments: [],
    creditMemos: [],
    vendorOrders: [],
    waste: [],
    labor: {
      cost: 0,
      scheduledCost: 0,
      unpricedMinutes: 0,
      peopleMissingRates: [],
      records: [],
    },
    rentals: [],
    equipmentIssues: [],
    attributions: [],
    guests: [],
    ...overrides,
  };
}

const line = (
  projection: ReturnType<typeof projectCloseoutSources>,
  key: string,
) => projection.lines.find((row) => row.key === key)!;

describe("closeout source lines", () => {
  it("revenue is billed invoices less credits; payments net of refunds; drafts leave it open", () => {
    const projection = projectCloseoutSources(
      input({
        invoices: [
          {
            _id: "i1",
            version: 3,
            status: "paid",
            total: 3000,
            amountDue: 0,
            creditMemoAmount: 200,
          },
          {
            _id: "i2",
            version: 1,
            status: "sent",
            total: 1500,
            amountDue: 1500,
          },
          { _id: "i3", version: 1, status: "voided", total: 900 },
          { _id: "i4", version: 1, status: "draft", total: 400 },
        ],
        creditMemos: [
          { _id: "c1", version: 1, status: "available", amount: 200 },
        ],
        payments: [
          {
            _id: "p1",
            version: 2,
            status: "refunded",
            amount: 3000,
            refundedAmount: 200,
          },
          { _id: "p2", version: 1, status: "failed", amount: 999 },
        ],
      }),
    );
    const revenue = line(projection, "revenue");
    expect(revenue.actual).toBe(4300);
    expect(revenue.sources.reduce((t, s) => t + s.amount, 0)).toBe(4300);
    expect(revenue.complete).toBe(false);
    expect(revenue.note).toMatch(/1 draft invoice not sent/);
    expect(projection.collected).toBe(2800);
    expect(projection.payments.map((p) => p.id)).toEqual(["p1"]);
    expect(projection.outstanding).toBe(1500);
    expect(projection.billed).toBe(4500);
  });

  it("food counts received quantities only and stays open while an order is not received", () => {
    const projection = projectCloseoutSources(
      input({
        vendorOrders: [
          {
            _id: "o1",
            status: "partially_received",
            lines: [
              {
                _id: "l1",
                status: "receiving",
                orderedQuantity: 10,
                receivedQuantity: 6,
                unitCost: 4.5,
              },
            ],
          },
          {
            _id: "o2",
            status: "submitted",
            lines: [
              {
                _id: "l2",
                status: "added",
                orderedQuantity: 2,
                receivedQuantity: 0,
                unitCost: 10,
              },
            ],
          },
        ],
      }),
    );
    const food = line(projection, "ingredient");
    expect(food).toMatchObject({ actual: 27, planned: 65, complete: false });
    expect(food.note).toMatch(/2 orders not fully received/);
  });

  it("a partly received order alone keeps food open, and capture needs a typed food cost", () => {
    const projection = projectCloseoutSources(
      input({
        invoices: [{ _id: "i1", status: "paid", total: 4000, amountDue: 0 }],
        guests: [{ _id: "g1", checkedInAt: 1 }],
        vendorOrders: [
          {
            _id: "o1",
            status: "partially_received",
            lines: [
              {
                _id: "l1",
                status: "receiving",
                orderedQuantity: 10,
                receivedQuantity: 6,
                unitCost: 4.5,
              },
            ],
          },
        ],
      }),
    );
    const food = line(projection, "ingredient");
    expect(food).toMatchObject({ actual: 27, complete: false });
    expect(food.note).toMatch(/1 order not fully received/);
    // The received 27 alone would understate food cost: a blank total is refused.
    expect(() =>
      closeoutCaptureValues(projection, { labor: 0, waste: 0 }),
    ).toThrow(/Enter food cost - .*not fully received/);
    const { values } = closeoutCaptureValues(projection, {
      ingredient: 45,
      labor: 0,
      waste: 0,
    });
    expect(values.actualIngredientCost).toBe(45);
  });

  it("staff time with a missing pay rate is open and names the person", () => {
    const projection = projectCloseoutSources(
      input({
        labor: {
          cost: 150,
          scheduledCost: 200,
          unpricedMinutes: 120,
          peopleMissingRates: ["Jo Cook"],
          records: [{ _id: "t1", version: 1, minutes: 300 }],
        },
      }),
    );
    expect(line(projection, "labor")).toMatchObject({
      actual: 150,
      planned: 200,
      complete: false,
      note: "No pay rate for Jo Cook",
    });
  });

  it("equipment problems add our cost and wait for who pays; commissions wait for approval", () => {
    const projection = projectCloseoutSources(
      input({
        rentals: [
          {
            _id: "r1",
            status: "delivered",
            description: "Tent",
            vendorCost: 300,
          },
          {
            _id: "r2",
            status: "cancelled",
            description: "Heater",
            vendorCost: 90,
          },
        ],
        equipmentIssues: [
          {
            _id: "e1",
            kind: "damaged",
            status: "resolved",
            payer: "company",
            cost: 45,
          },
          {
            _id: "e2",
            kind: "missing",
            status: "open",
            payer: "undecided",
            cost: 0,
          },
        ],
        attributions: [
          {
            _id: "a1",
            status: "applied",
            attributionType: "sales_commission",
            allocatedAmount: 250,
          },
          {
            _id: "a2",
            status: "pending_approval",
            attributionType: "referral_fee",
            allocatedAmount: 100,
          },
          {
            _id: "a3",
            status: "rejected",
            attributionType: "other",
            allocatedAmount: 80,
          },
        ],
      }),
    );
    expect(line(projection, "vendor")).toMatchObject({
      actual: 345,
      planned: 300,
      complete: false,
    });
    expect(line(projection, "vendor").note).toMatch(/who pays/);
    expect(line(projection, "commission")).toMatchObject({
      actual: 250,
      complete: false,
    });
  });

  it("capture uses record totals, typed amounts only for open lines, and never invents a zero", () => {
    const projection = projectCloseoutSources(
      input({
        invoices: [{ _id: "i1", status: "paid", total: 4000, amountDue: 0 }],
        waste: [{ _id: "w1", status: "recorded", quantity: 3, unitCost: 5 }],
        guests: [{ _id: "g1", checkedInAt: 1 }],
      }),
    );
    expect(() => closeoutCaptureValues(projection, {})).toThrow(
      /Enter food cost/,
    );
    // A typed amount for a complete line is ignored: the records win.
    const { values, enteredKeys } = closeoutCaptureValues(projection, {
      revenue: 1,
      ingredient: 900,
      labor: 700,
    });
    expect(enteredKeys.sort()).toEqual(["ingredient", "labor"]);
    expect(values).toMatchObject({
      actualRevenue: 4000,
      actualIngredientCost: 900,
      actualWasteCost: 15,
      actualLaborCost: 700,
      actualVendorCost: 0,
      totalActualCost: 1615,
      grossProfit: 2385,
      revenueVariance: 1000,
      costVariance: 1385,
      expectedHeadcount: 50,
      actualHeadcount: 1,
    });
    expect(() =>
      closeoutCaptureValues(projection, { ingredient: -5, labor: 1 }),
    ).toThrow(/can't be negative/);
  });

  it("the signed food waste form gives the guest count when nobody checked in, and lists what was left", () => {
    const muda = (attendance: number | null, completedAt: number) => ({
      _id: `f${completedAt}`,
      version: 2,
      completedAt,
      answers: JSON.stringify({
        kind: "muda",
        muda: {
          attendance,
          staffError: true,
          staffErrorNote: "tray dropped",
          appetizersUsed: true,
          appetizerStyles: ["passed"],
          mainsHandling: "given_to_client",
          leftovers: [
            { item: "Meatballs", kind: "appetizer", amount: 12 },
            { item: "Chicken Piccata", kind: "main", amount: 4 },
          ],
        },
      }),
    });
    const projection = projectCloseoutSources(
      input({ foodWasteForms: [muda(40, 1), muda(46, 2)] }),
    );
    const headcount = line(projection, "headcount");
    expect(headcount.actual).toBe(46);
    expect(headcount.complete).toBe(true);
    expect(headcount.sources).toEqual([
      expect.objectContaining({ table: "fieldConfirmations", id: "f2" }),
    ]);
    const waste = line(projection, "waste");
    expect(waste.actual).toBe(0);
    expect(waste.complete).toBe(true);
    expect(waste.sources[0].label).toBe(
      "Left over: Meatballs 12 servings, Chicken Piccata 4 lb · given to client · staff mistake: tray dropped",
    );
    expect(
      closeoutCaptureValues(projection, { revenue: 1, ingredient: 1, labor: 1 })
        .values.actualHeadcount,
    ).toBe(46);

    // Guests checked in one by one win over the lead's estimate.
    const checked = projectCloseoutSources(
      input({
        foodWasteForms: [muda(46, 2)],
        guests: [{ _id: "g1", version: 1, checkedInAt: 5 }],
      }),
    );
    expect(line(checked, "headcount").actual).toBe(1);
    // A form with no count leaves the line open, as before.
    const blank = projectCloseoutSources(
      input({ foodWasteForms: [muda(null, 2)] }),
    );
    expect(line(blank, "headcount").complete).toBe(false);
  });
});
