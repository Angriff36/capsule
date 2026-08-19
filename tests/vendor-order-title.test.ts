import { readFileSync } from "node:fs";
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

describe("folio and purchasing ledgers use vendorOrderTitle", () => {
  it("VendorOrderPage H1 is vendorOrderTitle, not Unnumbered order", () => {
    const folio = readFileSync(
      "src/features/inventory/VendorOrderPage.tsx",
      "utf8",
    );
    expect(folio).toContain('from "./vendorOrderNumber"');
    expect(folio).toMatch(
      /<h1 className="display-title mt-2">\s*\{vendorOrderTitle\(order\)\}\s*<\/h1>/,
    );
    expect(folio).not.toContain('"Unnumbered order"');
    expect(folio).not.toContain("order.orderNumber ||");
  });

  it("PurchasingPage list titles use the same helper", () => {
    const purchasing = readFileSync(
      "src/features/inventory/PurchasingPage.tsx",
      "utf8",
    );
    expect(purchasing).toContain("{vendorOrderTitle(order)}");
    expect(purchasing).not.toContain("order.orderNumber ||");
    expect(purchasing).not.toContain('"Unnumbered order"');
  });
});
