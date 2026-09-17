// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { VendorOrderPage } from "../src/features/inventory/VendorOrderPage";
import { PurchasingPage } from "../src/features/inventory/PurchasingPage";

const id = "wd7c3bv09fwcynzbgtjj2qavyx8bjpd6";
function fixture() {
  const order = {
    _id: id,
    vendorId: "vendor-a",
    status: "received",
    version: 4,
    orderNumber: null,
    liveTotalAmount: 0,
    totalAmount: 0,
    subtotal: 0,
    taxAmount: 8,
    shippingAmount: 12,
  };
  backend.values.set("useGetVendorOrder", order);
  backend.values.set("useListVendorOrder", [order]);
  backend.values.set("useListVendor", [
    { _id: "vendor-a", name: "Harbor Seafood" },
  ]);
  const line = {
    _id: "line-a",
    vendorOrderId: id,
    status: "complete",
    orderedQuantity: 16,
    receivedQuantity: 16,
    unitCost: 6.25,
    lineTotal: 100,
    lineTotalAmount: null,
    unit: "pound",
    deletedAt: null,
  };
  backend.values.set("useListVendorOrderLine", [
    line,
    { ...line, _id: "deleted", deletedAt: 1, lineTotal: 900 },
    { ...line, _id: "other", vendorOrderId: "other-order", lineTotal: 700 },
  ]);
  return order;
}
it("shows the received order's reconstructed total and stable title in the actual folio", async () => {
  const order = fixture();
  const page = () =>
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/inventory/orders/:id",
        element: createElement(VendorOrderPage),
      }),
    );
  await mount(page(), `/inventory/orders/${id}`);
  expect(container.querySelector("h1")?.textContent).toBe("Order yx8bjpd6");
  expect(container.querySelector(".order-state strong")?.textContent).toBe(
    "$120.00",
  );
  backend.values.set("useGetVendorOrder", { ...order, orderNumber: "PO-12" });
  await mount(page());
  expect(container.querySelector("h1")?.textContent).toBe("PO-12");
});
it("shows the same received order's title and reconstructed total in the purchasing ledger", async () => {
  const order = fixture();
  await mount(createElement(PurchasingPage));
  const row = [...container.querySelectorAll("tbody tr")].find((row) =>
    row.textContent?.includes("Order yx8bjpd6"),
  );
  expect(row).toBeDefined();
  expect(row?.textContent).toContain("$120.00");
  backend.values.set("useListVendorOrder", [
    { ...order, orderNumber: "PO-12" },
  ]);
  await mount(createElement(PurchasingPage));
  expect(container.querySelector("tbody")?.textContent).toContain("PO-12");
  expect(container.querySelector("tbody")?.textContent).not.toContain(
    "Order yx8bjpd6",
  );
});
