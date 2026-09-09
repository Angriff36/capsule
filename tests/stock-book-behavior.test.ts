// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  backend,
  container,
  mount,
  button,
  click,
  command,
  input,
  submit,
} from "./support/mounted-app";
import { StockBookPage } from "../src/features/inventory/StockBookPage";
import { InventoryOverviewPage } from "../src/features/inventory/InventoryOverviewPage";
import { DashboardWidgetPolicy } from "../src/features/home/DashboardWidgetPolicy";
import { PageGuide } from "../src/app/guide/PageGuide";

function fixture() {
  backend.values.set("useListIngredient", [
    {
      _id: "ingredient-a",
      name: "Carrots",
      unit: "kilogram",
      status: "active",
    },
  ]);
  backend.values.set("useListInventoryItem", [
    {
      _id: "low",
      ingredientId: "ingredient-a",
      locationId: "location-a",
      quantityOnHand: 1,
      reorderThreshold: 4,
      parLevel: 10,
      unit: "each",
      version: 3,
    },
    {
      _id: "equal",
      ingredientId: "ingredient-a",
      locationId: "location-b",
      quantityOnHand: 4,
      reorderThreshold: 4,
      parLevel: 10,
      unit: "each",
      version: 1,
    },
    {
      _id: "zero",
      ingredientId: "ingredient-a",
      quantityOnHand: 0,
      reorderThreshold: 0,
      unit: "each",
      version: 1,
    },
  ]);
  backend.values.set("useListStorageLocation", [
    { _id: "location-a", name: "Walk-in", status: "active" },
    { _id: "location-b", name: "Prep fridge", status: "active" },
  ]);
}
it("tells operators to reorder actual shortages rather than every below-PAR item", async () => {
  await mount(createElement(PageGuide), "/inventory");
  expect(container.textContent).toContain(
    "Watch the Below reorder alerts — that's what to reorder.",
  );
  expect(container.textContent).not.toContain("Below PAR list");
  await click(button("Dismiss"));
  await click(button("About Inventory"));
  expect(container.textContent).toContain("Below reorder alerts");
});
it("shows only actual reorder shortages in the stock book and overview, using catalog units", async () => {
  fixture();
  await mount(createElement(StockBookPage));
  const section = [...container.querySelectorAll("section")].find(
    (section) => section.querySelector("h2")?.textContent === "Below reorder",
  );
  expect(section).toBeDefined();
  expect(section!.querySelectorAll("tbody tr")).toHaveLength(1);
  expect(section!.textContent).toContain("Walk-in");
  expect(section!.textContent).toContain("kilogram");
  expect(section!.textContent).not.toContain("Prep fridge");
  await mount(createElement(InventoryOverviewPage));
  const lowLinks = [
    ...container.querySelectorAll('a[href^="/inventory/stock?item="]'),
  ];
  expect(lowLinks.map((link) => link.getAttribute("href"))).toContain(
    "/inventory/stock?item=low",
  );
  expect(lowLinks.map((link) => link.getAttribute("href"))).not.toContain(
    "/inventory/stock?item=equal",
  );
  expect(lowLinks.map((link) => link.getAttribute("href"))).not.toContain(
    "/inventory/stock?item=zero",
  );
  expect(container.textContent).toContain("kilogram");
  const views = new DashboardWidgetPolicy().build({
    events: [],
    invoices: [],
    inventoryItems: backend.values.get("useListInventoryItem") as never[],
    ingredients: backend.values.get("useListIngredient") as never[],
    assignments: [],
    payments: [],
    vendorOrders: [],
  });
  expect(views.low_stock_alerts.rows).toHaveLength(1);
  expect(views.low_stock_alerts.rows[0].href).toBe("/inventory/stock?item=low");
  expect(views.low_stock_alerts.rows[0].meta).toContain("kilogram");
});

it("receives a concrete quantity against the selected stock line and rejects zero receipts", async () => {
  fixture();
  const receive = command("useInventoryItemReceiveStock");
  await mount(createElement(StockBookPage));
  const row = container.querySelector("#stock-row-low")!;
  await click(button("Receive", row));
  input("quantity", "0");
  await submit(
    container.querySelector<HTMLFormElement>("[data-action-prompt]")!,
  );
  expect(receive).not.toHaveBeenCalled();
  await click(button("Receive", row));
  input("quantity", "2.5");
  await submit(
    container.querySelector<HTMLFormElement>("[data-action-prompt]")!,
  );
  expect(receive).toHaveBeenCalledExactlyOnceWith({
    docId: "low",
    version: 3,
    quantity: 2.5,
  });
});
it("retains a first-land item bookmark until rows arrive and does not repeatedly scroll after updates", async () => {
  const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView);
  await mount(createElement(StockBookPage), "/inventory/stock?item=low");
  expect(scroll).not.toHaveBeenCalled();
  fixture();
  await mount(createElement(StockBookPage));
  const row = container.querySelector("#stock-row-low");
  expect(row).not.toBeNull();
  expect(scroll.mock.contexts).toContain(row);
  const calls = scroll.mock.calls.length;
  backend.values.set("useListInventoryItem", [
    ...(backend.values.get("useListInventoryItem") as unknown[]),
  ]);
  await mount(createElement(StockBookPage));
  expect(scroll).toHaveBeenCalledTimes(calls);
});
it("focuses and scrolls the transfer editor when opened and dismisses it on Escape", async () => {
  fixture();
  await mount(createElement(StockBookPage));
  await click(button("Transfer", container.querySelector("#stock-row-low")!));
  const editor = container.querySelector("#supply-stock-editor");
  expect(editor).not.toBeNull();
  expect(editor!.contains(document.activeElement)).toBe(true);
  expect(
    vi.mocked(HTMLElement.prototype.scrollIntoView).mock.contexts,
  ).toContain(editor);
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
  );
  expect(container.querySelector("#supply-stock-editor")).toBeNull();
});
