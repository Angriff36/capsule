/**
 * BE-10.5: a sent order that is now more than the event needs is shown to
 * the buyer, never rewritten. Drafts are not "sent"; fully received orders
 * are stock already; a cancelled event makes its whole share extra.
 */
import { describe, expect, it } from "vitest";
import { sentOrderSurplus } from "../../../src/features/inventory/sentOrderSurplus";

const need = {
  _id: "need-1",
  eventId: "event-1",
  ingredientId: "ing-1",
  unit: "kilogram",
  status: "ordered",
  requiredQuantity: 3,
  orderedQuantity: 4,
  vendorOrderId: "order-1",
  deletedAt: null,
};

describe("sent orders now more than needed", () => {
  it("names the extra on a sent, confirmed or partly received order", () => {
    for (const status of ["submitted", "confirmed", "partially_received"]) {
      expect(
        sentOrderSurplus({
          needs: [need],
          orders: [{ _id: "order-1", status }],
        }),
      ).toEqual([
        {
          needId: "need-1",
          eventId: "event-1",
          ingredientId: "ing-1",
          vendorOrderId: "order-1",
          unit: "kilogram",
          orderedFor: 4,
          nowNeeded: 3,
          extra: 1,
          eventCancelled: false,
        },
      ]);
    }
  });

  it("stays quiet for drafts, received or cancelled orders, and needs that did not drop", () => {
    for (const status of ["draft", "pending_approval", "received", "cancelled"])
      expect(
        sentOrderSurplus({
          needs: [need],
          orders: [{ _id: "order-1", status }],
        }),
      ).toEqual([]);
    expect(
      sentOrderSurplus({
        needs: [{ ...need, requiredQuantity: 5 }],
        orders: [{ _id: "order-1", status: "submitted" }],
      }),
    ).toEqual([]);
    expect(
      sentOrderSurplus({
        needs: [{ ...need, orderedQuantity: null }],
        orders: [{ _id: "order-1", status: "submitted" }],
      }),
    ).toEqual([]);
  });

  it("counts the whole share as extra when the event was cancelled", () => {
    const [row] = sentOrderSurplus({
      needs: [{ ...need, status: "cancelled" }],
      orders: [{ _id: "order-1", status: "confirmed" }],
    });
    expect(row).toMatchObject({ nowNeeded: 0, extra: 4, eventCancelled: true });
  });
});
