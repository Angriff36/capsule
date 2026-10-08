// @vitest-environment jsdom
/**
 * AC-470 (BE-10.3): each consolidated weekly order line lists the events that
 * feed it, with each event's own amount. AC-468: an event whose recipe units
 * do not turn into the buying unit is named on the line with the reason.
 */
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "../../support/mounted-app";
import { VendorOrderPage } from "../../../src/features/inventory/VendorOrderPage";

const orderId = "wd7c3bv09fwcynzbgtjj2qavyx8bjpd6";

function fixture() {
  const order = {
    _id: orderId,
    vendorId: "vendor-a",
    status: "draft",
    isDraft: true,
    version: 2,
    orderNumber: "PO-7",
    liveTotalAmount: 30,
    totalAmount: 30,
    subtotal: 30,
    taxAmount: 0,
    shippingAmount: 0,
  };
  backend.values.set("useGetVendorOrder", order);
  backend.values.set("useListVendor", [
    { _id: "vendor-a", name: "Harbor Dry Goods" },
  ]);
  backend.values.set("useListIngredient", [
    { _id: "ing-flour", name: "Flour" },
  ]);
  backend.values.set("useListEvent", [
    { _id: "event-lunch", title: "Monday lunch", stage: "approved" },
    { _id: "event-gala", title: "Friday gala", stage: "approved" },
  ]);
  backend.values.set("useListVendorOrderLine", [
    {
      _id: "line-flour",
      vendorOrderId: orderId,
      ingredientId: "ing-flour",
      status: "added",
      orderedQuantity: 15,
      plannedQuantity: 15,
      quantityIsManual: false,
      receivedQuantity: 0,
      remainingQuantity: 15,
      unitCost: 2,
      lineTotal: 30,
      unit: "kilogram",
      deletedAt: null,
    },
  ]);
  backend.values.set("useListVendorOrderLineDemand", [
    {
      _id: "link-lunch",
      vendorOrderId: orderId,
      vendorOrderLineId: "line-flour",
      ingredientDemandId: "demand-lunch",
      deletedAt: null,
      removedAt: null,
    },
    {
      _id: "link-gala",
      vendorOrderId: orderId,
      vendorOrderLineId: "line-flour",
      ingredientDemandId: "demand-gala",
      deletedAt: null,
      removedAt: null,
    },
  ]);
  backend.values.set("useListPurchaseNeed", [
    {
      _id: "need-lunch",
      eventId: "event-lunch",
      ingredientDemandId: "demand-lunch",
      requiredQuantity: 10,
      unit: "kilogram",
      status: "open",
      deletedAt: null,
    },
    {
      _id: "need-gala",
      eventId: "event-gala",
      ingredientDemandId: "demand-gala",
      requiredQuantity: 5,
      unit: "kilogram",
      status: "open",
      deletedAt: null,
    },
  ]);
  backend.values.set("useListIngredientDemand", [
    { _id: "demand-lunch", eventId: "event-lunch", unitReviewReason: null },
    {
      _id: "demand-gala",
      eventId: "event-gala",
      unitReviewReason:
        "Some recipe amounts for this item are in units that don't turn into kilogram, so they are left out of this amount. Record how the units convert, or fix the recipe unit.",
    },
  ]);
  backend.values.set("useListInventoryLot", []);
  backend.values.set("useListStorageLocation", []);
  backend.values.set("useListVendorContact", []);
}

it("each consolidated line lists its per-event contributions", async () => {
  fixture();
  await mount(
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/inventory/orders/:id",
        element: createElement(VendorOrderPage),
      }),
    ),
    `/inventory/orders/${orderId}`,
  );
  const line = container.querySelector(".order-line-summary");
  expect(line?.textContent).toContain("Flour");
  expect(line?.textContent).toContain("2 contributing purchase needs");
  const shares = [...(line?.querySelectorAll("small") ?? [])].map(
    (node) => node.textContent,
  );
  expect(shares).toContain("Monday lunch · 10 kilogram");
  expect(shares).toContain("Friday gala · 5 kilogram");
  expect(shares).toContain(
    "Current calculation: 15 kilogram · updates with event requirements",
  );
  const issue = [...(line?.querySelectorAll('[role="status"]') ?? [])].map(
    (node) => node.textContent,
  );
  expect(issue).toEqual([
    "Friday gala: Some recipe amounts for this item are in units that don't turn into kilogram, so they are left out of this amount. Record how the units convert, or fix the recipe unit.",
  ]);
});
