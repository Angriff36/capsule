import { describe, expect, it } from "vitest";
import { referenceOnlyMoneyRows } from "../../../src/features/admin/import/referenceOnlyRows";

// AC-085: the matching page counts the old money lines kept for the record
// only, so it can say they are not counted in any total.
describe("reference-only money lines", () => {
  const link = (over: Record<string, unknown>) => ({
    recordType: "payment",
    conflictStatus: "resolved",
    capsuleId: "",
    rawSourceData: JSON.stringify({ rowClass: "aggregate_report" }),
    deletedAt: null,
    ...over,
  });
  it("counts kept money lines and leaves out waiting, matched and other rows", () => {
    expect(
      referenceOnlyMoneyRows([
        link({}),
        link({
          rawSourceData: JSON.stringify({ rowClass: "payment", amount: 0 }),
        }),
        link({ conflictStatus: "pending_conflict" }),
        link({ capsuleId: "payment-1" }),
        link({ recordType: "event" }),
        link({ deletedAt: 5 }),
        link({ rawSourceData: "{}" }),
        link({ rawSourceData: "not json" }),
      ]),
    ).toBe(2);
  });
});
