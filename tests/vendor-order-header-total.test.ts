import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatMoneyExact } from "../src/lib/format";
import {
  vendorOrderHeaderTotal,
  vendorOrderLineMoney,
} from "../src/features/inventory/vendorOrderHeaderTotal";

// QA leftover after #140 / PR #159: recordReceipt rolls the line to $100
// and getVendorOrder.liveTotalAmount is 100 in the runtime proof, but
// production still painted header $0. Two read paths do that:
//   1. listVendorOrder does not hydrate self.lines, so the computed
//      liveTotalAmount inlines as 0 and the UI fell through to stored 0
//      (syncLineTotals cannot write received headers).
//   2. pre-#140 received rows have null lineTotalAmount; the computed
//      sums those as 0 while the line row paints lineTotal (qty * cost).

const receivedOrder = {
  _id: "vo-received-100",
  status: "received",
  liveTotalAmount: 0,
  totalAmount: 0,
  subtotal: 0,
  taxAmount: 0,
  shippingAmount: 0,
};

const submittedOrder = {
  _id: "vo-submitted-100",
  status: "submitted",
  liveTotalAmount: 0,
  totalAmount: 0,
  subtotal: 0,
  taxAmount: 0,
  shippingAmount: 0,
};

const hundredDollarLine = {
  _id: "vol-saffron",
  vendorOrderId: "vo-received-100",
  deletedAt: null,
  status: "complete",
  orderedQuantity: 16,
  unitCost: 6.25,
  lineTotal: 100,
  lineTotalAmount: null,
};

describe("vendorOrderHeaderTotal — received PO line $100 cannot paint header $0", () => {
  it("reconstructs $100 from the line the folio already paints", () => {
    const header = vendorOrderHeaderTotal(receivedOrder, [hundredDollarLine]);
    expect(header).toBe(100);
    expect(formatMoneyExact(header)).toBe("$100.00");
    expect(formatMoneyExact(header)).not.toBe("$0.00");
  });

  it("uses qty * unitCost when both stored and painted line totals are missing", () => {
    const header = vendorOrderHeaderTotal(receivedOrder, [
      {
        vendorOrderId: "vo-received-100",
        deletedAt: null,
        orderedQuantity: 16,
        unitCost: 6.25,
      },
    ]);
    expect(header).toBe(100);
    expect(formatMoneyExact(header)).not.toBe("$0.00");
  });

  it("keeps a hydrated liveTotalAmount of $100 without lines", () => {
    expect(
      vendorOrderHeaderTotal({
        _id: "vo-live",
        liveTotalAmount: 100,
        totalAmount: 0,
      }),
    ).toBe(100);
  });

  it("an empty draft with no line money still paints $0", () => {
    const header = vendorOrderHeaderTotal(
      {
        _id: "vo-empty",
        liveTotalAmount: 0,
        totalAmount: 0,
        taxAmount: 0,
        shippingAmount: 0,
      },
      [],
    );
    expect(header).toBe(0);
    expect(formatMoneyExact(header)).toBe("$0.00");
  });

  it("ignores deleted lines and other orders", () => {
    expect(
      vendorOrderHeaderTotal(receivedOrder, [
        { ...hundredDollarLine, deletedAt: 1 },
        {
          ...hundredDollarLine,
          vendorOrderId: "vo-other",
          lineTotal: 50,
          lineTotalAmount: 50,
        },
      ]),
    ).toBe(0);
  });

  it("adds tax and shipping on top of the line sum", () => {
    expect(
      vendorOrderHeaderTotal(
        { ...receivedOrder, taxAmount: 8, shippingAmount: 12 },
        [hundredDollarLine],
      ),
    ).toBe(120);
  });

  it("line money prefers stored lineTotalAmount when present", () => {
    expect(
      vendorOrderLineMoney({
        lineTotalAmount: 80,
        lineTotal: 100,
        orderedQuantity: 16,
        unitCost: 6.25,
      }),
    ).toBe(80);
  });

  it("submitted order with a $100 line cannot paint Needs Attention $0.00", () => {
    const header = vendorOrderHeaderTotal(submittedOrder, [
      { ...hundredDollarLine, vendorOrderId: "vo-submitted-100" },
    ]);
    expect(header).toBe(100);
    expect(formatMoneyExact(header)).toBe("$100.00");
    expect(formatMoneyExact(header)).not.toBe("$0.00");
  });
});

describe("folio and purchasing ledgers use the header helper", () => {
  it("VendorOrderPage and PurchasingPage no longer paint live ?? stored", () => {
    const folio = readFileSync(
      "src/features/inventory/VendorOrderPage.tsx",
      "utf8",
    );
    const purchasing = readFileSync(
      "src/features/inventory/PurchasingPage.tsx",
      "utf8",
    );
    expect(folio).toContain("vendorOrderHeaderTotal(order, lines)");
    expect(purchasing).toContain("vendorOrderHeaderTotal(order, lines)");
    expect(folio).not.toContain("order.liveTotalAmount ?? order.totalAmount");
    expect(purchasing).not.toContain(
      "order.liveTotalAmount ?? order.totalAmount",
    );
  });

  it("Needs Attention cannot paint $0.00 for a submitted/received $100 line", () => {
    const overview = readFileSync(
      "src/features/inventory/InventoryOverviewPage.tsx",
      "utf8",
    );
    expect(overview).toContain("vendorOrderHeaderTotal(order, lines)");
    expect(overview).not.toContain(
      "order.liveTotalAmount ?? order.totalAmount",
    );
    const submittedPaint = formatMoneyExact(
      vendorOrderHeaderTotal(submittedOrder, [
        { ...hundredDollarLine, vendorOrderId: "vo-submitted-100" },
      ]),
    );
    const receivedPaint = formatMoneyExact(
      vendorOrderHeaderTotal(receivedOrder, [hundredDollarLine]),
    );
    expect(submittedPaint).toBe("$100.00");
    expect(receivedPaint).toBe("$100.00");
    expect(submittedPaint).not.toBe("$0.00");
    expect(receivedPaint).not.toBe("$0.00");
  });
});
