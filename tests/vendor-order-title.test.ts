import { describe, expect, it } from "vitest";
import { vendorOrderTitle } from "../src/features/inventory/vendorOrderNumber";

// QA leftover after 167/199: vendorOrderTitle already preferred a persisted
// orderNumber or a short-id fallback, but the folio H1 still painted
// "Unnumbered order" for received POs (yx8bjpd6 / Harbor Seafood Supply).

const receivedNoNumber = {
  _id: "wd7c3bv09fwcynzbgtjj2qavyx8bjpd6",
  orderNumber: null as string | null,
  status: "received",
};

describe("vendorOrderTitle — received PO is never Unnumbered order", () => {
  it("uses a persisted orderNumber when present", () => {
    expect(
      vendorOrderTitle({
        _id: receivedNoNumber._id,
        orderNumber: "PO-12",
      }),
    ).toBe("PO-12");
  });

  it("falls back to the visible short id when orderNumber is empty", () => {
    expect(vendorOrderTitle(receivedNoNumber)).toBe("Order yx8bjpd6");
    expect(vendorOrderTitle({ ...receivedNoNumber, orderNumber: "" })).toBe(
      "Order yx8bjpd6",
    );
    expect(vendorOrderTitle({ ...receivedNoNumber, orderNumber: "   " })).toBe(
      "Order yx8bjpd6",
    );
    expect(vendorOrderTitle(receivedNoNumber)).not.toBe("Unnumbered order");
  });
});
