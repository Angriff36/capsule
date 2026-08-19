import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VendorOrderHeaderTotal } from "../../../src/features/inventory/VendorOrderHeaderTotal";
import { vendorOrderHeaderTotal } from "../../../src/features/inventory/vendorOrderTotals";
import { formatMoneyExact } from "../../../src/lib/format";

const leftoverReceived = {
  status: "received",
  liveTotalAmount: 0,
  totalAmount: 0,
  taxAmount: 0,
  shippingAmount: 0,
};

const leftoverLine = {
  status: "complete",
  deletedAt: null,
  lineTotalAmount: null,
  lineTotal: 100,
  orderedQuantity: 1,
  unitCost: 100,
};

describe("received PO header total follows line amounts (#140 leftover)", () => {
  it("rolls a received $100 line instead of painting the $0 header fields", () => {
    expect(vendorOrderHeaderTotal(leftoverReceived, [leftoverLine])).toBe(100);
    expect(
      formatMoneyExact(
        leftoverReceived.liveTotalAmount ?? leftoverReceived.totalAmount,
      ),
    ).toBe("$0.00");
  });

  it("paints $100.00 on the folio header, not $0.00", () => {
    const html = renderToStaticMarkup(
      createElement(VendorOrderHeaderTotal, {
        order: leftoverReceived,
        lines: [leftoverLine],
      }),
    );
    expect(html).toContain("$100.00");
    expect(html).not.toContain("$0.00");
    expect(html).toContain('data-testid="vendor-order-header-total"');
  });

  it("rolls leftover production rows that only stored qty × unitCost", () => {
    expect(
      vendorOrderHeaderTotal(leftoverReceived, [
        {
          status: "complete",
          orderedQuantity: 16,
          unitCost: 6.25,
        },
      ]),
    ).toBe(100);
  });

  it("uses lines already hydrated on the order record", () => {
    expect(
      vendorOrderHeaderTotal({
        ...leftoverReceived,
        lines: [leftoverLine],
      }),
    ).toBe(100);
  });

  it("keeps a genuine zero when no line has money", () => {
    expect(
      vendorOrderHeaderTotal(leftoverReceived, [
        {
          status: "complete",
          orderedQuantity: 0,
          unitCost: 0,
          lineTotal: 0,
        },
      ]),
    ).toBe(0);
  });

  it("prefers liveTotalAmount when the computed already rolled", () => {
    expect(
      vendorOrderHeaderTotal({
        liveTotalAmount: 100,
        totalAmount: 0,
      }),
    ).toBe(100);
  });

  it("ignores cancelled and deleted lines", () => {
    expect(
      vendorOrderHeaderTotal(leftoverReceived, [
        {
          status: "cancelled",
          lineTotal: 50,
          orderedQuantity: 1,
          unitCost: 50,
        },
        {
          status: "complete",
          deletedAt: 1,
          lineTotal: 40,
          orderedQuantity: 1,
          unitCost: 40,
        },
        leftoverLine,
      ]),
    ).toBe(100);
  });

  it("wires the folio, purchase queue, overview, and dashboard through the helper", () => {
    const folio = readFileSync(
      "src/features/inventory/VendorOrderPage.tsx",
      "utf8",
    );
    const queue = readFileSync(
      "src/features/inventory/PurchasingPage.tsx",
      "utf8",
    );
    const overview = readFileSync(
      "src/features/inventory/InventoryOverviewPage.tsx",
      "utf8",
    );
    const dashboard = readFileSync(
      "src/features/home/DashboardWidgetPolicy.ts",
      "utf8",
    );
    expect(folio).toContain("VendorOrderHeaderTotal");
    expect(folio).not.toContain("liveTotalAmount ?? order.totalAmount");
    expect(queue).toContain("vendorOrderHeaderTotal");
    expect(queue).not.toContain("liveTotalAmount ?? order.totalAmount");
    expect(overview).toContain("vendorOrderHeaderTotal");
    expect(overview).not.toContain("liveTotalAmount ?? order.totalAmount");
    expect(dashboard).toContain("vendorOrderHeaderTotal");
    expect(dashboard).not.toContain("liveTotalAmount ?? order.totalAmount");
  });
});
