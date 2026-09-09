// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  button,
  click,
} from "./support/mounted-app";
import { CloseoutPage } from "../src/features/finance/CloseoutPage";
import { EventCostSummaryReport } from "../src/features/finance/EventCostSummaryReport";
import { FoodCostPercentagePage } from "../src/features/finance/FoodCostPercentagePage";

it("renders billed and draft invoice numbers separately and excludes drafts from billed revenue", async () => {
  await mount(
    createElement(EventCostSummaryReport, {
      event: {
        _id: "event-a",
        title: "Harborview supper",
        expectedHeadcount: 40,
      },
      closeout: { eventId: "event-a", status: "draft" },
      invoices: [
        {
          _id: "invoice-paid",
          eventId: "event-a",
          status: "paid",
          invoiceNumber: "INV-204",
          total: 900,
          amountPaid: 900,
        },
        {
          _id: "invoice-draft",
          eventId: "event-a",
          status: "draft",
          invoiceNumber: "INV-205",
          total: 3600,
        },
        {
          _id: "other",
          eventId: "event-b",
          status: "sent",
          invoiceNumber: "INV-OTHER",
          total: 8000,
        },
      ],
    }),
  );
  expect(
    container.querySelector('[data-testid="invoiced-revenue"]')?.textContent,
  ).toBe("$900");
  expect(container.textContent).toContain("Invoices: INV-204");
  expect(container.textContent).toContain("Drafts: INV-205");
  expect(container.textContent).not.toContain("INV-OTHER");
  expect(
    container.querySelector('[data-testid="total-event-cost"]')?.textContent,
  ).toBe("—");
  expect(
    container.querySelector('[data-testid="resulting-margin"]')?.textContent,
  ).toBe("—");
});
it("keeps a saved food-cost target while explaining an unscored revenue window", async () => {
  localStorage.setItem("capsule.finance.food-cost-target", "30");
  await mount(createElement(FoodCostPercentagePage));
  const ratio = [...container.querySelectorAll("span")].find(
    (node) => node.textContent === "Window ratio",
  )?.parentElement;
  expect(ratio?.querySelector("small")?.textContent).toBe(
    "No revenue to score",
  );
  expect(
    container.querySelector<HTMLInputElement>('input[type="number"]')?.value,
  ).toBe("30");
});

it("keeps unreconciled costs and profit unknown and carries the event into invoice creation", async () => {
  backend.values.set("useListEvent", [
    {
      _id: "event-a",
      title: "Harborview supper",
      clientId: "client-a",
      expectedHeadcount: 40,
    },
  ]);
  backend.values.set("useListInvoice", [
    {
      _id: "invoice-a",
      eventId: "event-a",
      status: "sent",
      total: 900,
      amountPaid: 200,
    },
    { _id: "draft-a", eventId: "event-a", status: "draft", total: 3600 },
  ]);
  const closeout = {
    _id: "closeout-a",
    eventId: "event-a",
    version: 1,
    status: "draft",
    totalActualCost: 0,
    grossProfit: 900,
    actualRevenue: 900,
    actualHeadcount: 0,
  };
  backend.values.set("useListEventCloseout", [closeout]);
  await mount(createElement(CloseoutPage));
  const cells = () =>
    [...container.querySelectorAll("tbody tr:first-child td")].map(
      (cell) => cell.textContent,
    );
  expect(cells().slice(1, 5)).toEqual(["$900.00", "—", "—", "—/40"]);
  expect(
    container.querySelector(
      'a[href="/finance/invoices?issue=1&clientId=client-a&eventId=event-a"]',
    )?.textContent,
  ).toBe("Issue invoice");
  backend.values.set("useListEventCloseout", [
    {
      ...closeout,
      status: "finalized",
      finalizedAt: 1,
      actualIngredientCost: 300,
      totalActualCost: 300,
      grossProfit: 600,
      actualHeadcount: 38,
    },
  ]);
  await mount(createElement(CloseoutPage));
  await click(button("Show finalized"));
  expect(cells().slice(1, 5)).toEqual([
    "$900.00",
    "$300.00",
    "$600.00",
    "38/40",
  ]);
});
