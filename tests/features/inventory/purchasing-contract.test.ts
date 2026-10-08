// @vitest-environment jsdom
/**
 * AC-483 (BE-10.6): the purchasing page opens on the week's automatic draft
 * and shows, per line, what is needed, what stock covers, what is already on
 * other orders, what to buy, what is ordered and received, the events behind
 * it, buyer changes, pack rounding, how far the order has gone and anything
 * that needs a look, with no "confirm demand" / "create need" / linking step.
 */
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  input,
  mount,
  submit,
} from "../../support/mounted-app";
import { PurchasingPage } from "../../../src/features/inventory/PurchasingPage";
import {
  currentWeeklyDraft,
  weeklyDraftLines,
} from "../../../src/features/inventory/weeklyDraftView";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

function fixture() {
  const draft = {
    _id: "order-week",
    vendorId: "vendor-a",
    status: "draft",
    sourceRangeStart: now + DAY,
    orderNumber: "WK-1",
    deletedAt: null,
  };
  backend.values.set("useListVendor", [
    { _id: "vendor-a", name: "Harbor Dry Goods", status: "active" },
  ]);
  backend.values.set("useListVendorOrder", [
    draft,
    {
      ...draft,
      _id: "order-old",
      sourceRangeStart: now - 21 * DAY,
      orderNumber: "WK-0",
    },
  ]);
  backend.values.set("useListIngredient", [
    { _id: "ing-flour", name: "Flour" },
    { _id: "ing-oil", name: "Olive oil" },
  ]);
  backend.values.set("useListEvent", [
    { _id: "event-lunch", title: "Monday lunch" },
    { _id: "event-gala", title: "Friday gala" },
  ]);
  backend.values.set("useListVendorOrderLine", [
    {
      _id: "line-flour",
      vendorOrderId: "order-week",
      ingredientId: "ing-flour",
      unit: "kilogram",
      status: "added",
      plannedQuantity: 13.5,
      orderedQuantity: 18,
      quantityIsManual: true,
      receivedQuantity: 0,
      stockAppliedQuantity: 2,
      pendingSupplyQuantity: 0.5,
      unitCost: 2,
      deletedAt: null,
    },
    {
      _id: "line-oil",
      vendorOrderId: "order-week",
      ingredientId: "ing-oil",
      unit: "liter",
      status: "added",
      plannedQuantity: 3,
      orderedQuantity: 3,
      quantityIsManual: false,
      receivedQuantity: 1,
      unitCost: 9,
      deletedAt: null,
    },
  ]);
  backend.values.set("useListVendorOrderLineDemand", [
    {
      vendorOrderId: "order-week",
      vendorOrderLineId: "line-flour",
      ingredientDemandId: "demand-lunch",
      deletedAt: null,
    },
    {
      vendorOrderId: "order-week",
      vendorOrderLineId: "line-flour",
      ingredientDemandId: "demand-gala",
      deletedAt: null,
    },
    {
      vendorOrderId: "order-week",
      vendorOrderLineId: "line-oil",
      ingredientDemandId: "demand-gala-oil",
      deletedAt: null,
    },
  ]);
  backend.values.set("useListPurchaseNeed", [
    {
      _id: "need-lunch",
      eventId: "event-lunch",
      ingredientId: "ing-flour",
      ingredientDemandId: "demand-lunch",
      requiredQuantity: 10,
      unit: "kilogram",
      status: "open",
      deletedAt: null,
    },
    {
      _id: "need-gala",
      eventId: "event-gala",
      ingredientId: "ing-flour",
      ingredientDemandId: "demand-gala",
      requiredQuantity: 6,
      unit: "kilogram",
      status: "open",
      deletedAt: null,
    },
    {
      _id: "need-gala-oil",
      eventId: "event-gala",
      ingredientId: "ing-oil",
      ingredientDemandId: "demand-gala-oil",
      requiredQuantity: 3,
      unit: "liter",
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
        "Some recipe amounts for this item are in units that don't turn into kilogram, so they are left out of this amount.",
    },
    { _id: "demand-gala-oil", eventId: "event-gala" },
  ]);
  backend.values.set("useListItemUnitMapping", [
    {
      ingredientId: "ing-flour",
      kind: "pack",
      unit: "case",
      equalsQuantity: 6,
      equalsUnit: "kilogram",
      recordedAt: 1,
      deletedAt: null,
    },
  ]);
}

it("the purchasing page opens on the weekly draft and shows quantities, breakdown, baseline-vs-manual, rounding, and commitment status", async () => {
  fixture();
  await mount(createElement(PurchasingPage), "/inventory/purchasing");

  const panel = container.querySelector('[aria-label="This week\'s draft"]');
  expect(panel, "the week's draft is on the purchasing page").not.toBeNull();
  // The current week's draft, not the old one.
  expect(panel!.textContent).toContain("Harbor Dry Goods");
  expect(
    panel!.querySelector('[data-testid="draft-commitment"]')?.textContent,
  ).toContain("not sent to the vendor");
  const reviewLink = panel!.querySelector(
    "a[href='/inventory/orders/order-week']",
  );
  expect(reviewLink?.textContent).toContain("Review & send");

  const headings = [...panel!.querySelectorAll("th")].map(
    (th) => th.textContent,
  );
  expect(headings).toEqual([
    "Item",
    "Needed",
    "From stock",
    "On other orders",
    "To buy",
    "Ordering",
    "Received",
    "Still to come",
  ]);
  const rows = [...panel!.querySelectorAll('[data-testid="draft-line"]')].map(
    (row) => [...row.querySelectorAll("td")].map((td) => td.textContent),
  );
  expect(rows).toEqual([
    ["Flour", "16 kilogram", "2", "0.5", "13.5", "18", "0", "18"],
    ["Olive oil", "3 liter", "0", "0", "3", "3", "1", "2"],
  ]);

  const details = [
    ...panel!.querySelectorAll('[data-testid="draft-line-detail"]'),
  ].map((row) => row.textContent ?? "");
  expect(details[0]).toContain(
    "For: Monday lunch 10 kilogram · Friday gala 6 kilogram",
  );
  expect(details[0]).toContain(
    "Automatic amount 13.5 kilogram · you changed it to 18 kilogram",
  );
  expect(details[0]).toContain(
    "Sold by the case (6 kilogram): 3 cases = 18 kilogram, 4.5 kilogram extra · ordering whole packs",
  );
  expect(details[0]).toContain("Friday gala: Some recipe amounts");
  expect(details[0]).toContain("Look at it on the order");
  expect(details[1]).toContain("Automatic amount · follows event changes");
  expect(details[1]).toContain("No pack size recorded");

  // Normal operation needs no confirm-demand, create-need or linking step.
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/confirm demand|create need|link to line/i);
});

it("picks this week's draft, else the next one, else the latest", () => {
  const order = (id: string, at: number) => ({
    _id: id,
    vendorId: "v",
    status: "draft",
    sourceRangeStart: at,
  });
  const past = order("past", now - 30 * DAY);
  const next = order("next", now + 3 * DAY);
  const later = order("later", now + 20 * DAY);
  expect(currentWeeklyDraft([later, past, next], now)?._id).toBe("next");
  expect(currentWeeklyDraft([past], now)?._id).toBe("past");
  expect(
    currentWeeklyDraft([{ ...next, status: "submitted" }], now),
  ).toBeNull();
});

it("a line added by hand has no event share and its need is what it orders", () => {
  const [row] = weeklyDraftLines({
    order: { _id: "o", vendorId: "v", status: "draft" },
    lines: [
      {
        _id: "l",
        vendorOrderId: "o",
        ingredientId: "i",
        unit: "each",
        status: "added",
        orderedQuantity: 4,
        receivedQuantity: 0,
      },
    ],
    links: [],
    needs: [],
    demands: [],
    mappings: [],
  });
  expect(row).toMatchObject({
    needed: 4,
    toBuy: 4,
    ordering: 4,
    buyerChanged: false,
    events: [],
  });
});

it("AC-083: with no vendors, an ad-hoc order adds the typed vendor and then opens the order for it", async () => {
  backend.values.set("useListVendor", []);
  const createVendor = command("useCreateVendor", { docId: "vendor-new" });
  const createOrder = command("useCreateVendorOrder", { docId: "order-new" });
  await mount(createElement(PurchasingPage), "/inventory/purchasing");
  await click(button("Start an extra order"));
  input("newVendorName", "Sysco");
  input("notes", "Friday drop");
  await submit(container.querySelector<HTMLFormElement>("form.supply-form")!);
  expect(createVendor).toHaveBeenCalledWith({
    name: "Sysco",
    paymentTermsDays: 30,
  });
  expect(createOrder).toHaveBeenCalledWith(
    expect.objectContaining({ vendorId: "vendor-new", notes: "Friday drop" }),
  );
});
