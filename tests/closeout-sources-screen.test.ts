// @vitest-environment jsdom
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
} from "./support/mounted-app";
import { CloseoutPage } from "../src/features/finance/CloseoutPage";
import { projectCloseoutSources } from "../src/lib/closeoutSourceProjection";

// PL-CLOSEOUT screen (AC-625 / AC-626 / AC-628): the closeout form shows the
// numbers from the event's records, asks only for the open lines, and a
// final closeout is corrected with a reason.

const projection = projectCloseoutSources({
  event: { quotedPrice: 4500, budgetAmount: 3000, expectedHeadcount: 40 },
  invoices: [
    { _id: "inv-1", version: 2, status: "sent", total: 4200, amountDue: 2200 },
  ],
  payments: [{ _id: "pay-1", status: "completed", amount: 2000 }],
  creditMemos: [],
  vendorOrders: [],
  waste: [{ _id: "w-1", status: "recorded", quantity: 2, unitCost: 10 }],
  labor: null,
  rentals: [],
  equipmentIssues: [],
  attributions: [],
  guests: [{ _id: "g-1", checkedInAt: 1 }],
});

function sourcesFor(closeout: unknown = null) {
  backend.values.set("closeoutSources:eventCloseoutSources", {
    projection,
    closeout,
  });
}

it("captures from records and asks only for the lines the records can't answer", async () => {
  backend.values.set("useListEvent", [
    { _id: "event-a", title: "Harborview supper", stage: "closed_out" },
  ]);
  backend.values.set("useListEventCloseout", []);
  sourcesFor();
  const capture = command("closeoutSources:captureCloseoutFromSources", {
    closeoutId: "closeout-a",
  });
  await mount(createElement(CloseoutPage));
  await click(
    container.querySelector<HTMLButtonElement>("header .btn-primary")!,
  );

  const table = container.querySelector('[data-testid="closeout-sources"]')!;
  const row = (key: string) => table.querySelector(`[data-line="${key}"]`)!;
  expect(row("revenue").textContent).toContain("$4,200.00");
  expect(row("revenue").querySelector("input")).toBeNull();
  expect(row("waste").textContent).toContain("Complete");
  expect(row("ingredient").textContent).toContain("No food deliveries");
  expect(container.textContent).toContain("Still owed $2,200.00");

  input("entered.ingredient", "650");
  input("entered.labor", "900");
  input("notes", "Ran long");
  await submit(container.querySelector<HTMLFormElement>("form.supply-form")!);
  expect(capture).toHaveBeenCalledWith({
    eventId: "event-a",
    entered: { ingredient: 650, labor: 900 },
    unresolvedIssues: undefined,
    performanceNotes: undefined,
    notes: "Ran long",
  });
});

it("corrects a final closeout with a reason and lists the earlier results", async () => {
  backend.values.set("useListEvent", [
    { _id: "event-a", title: "Harborview supper", stage: "closed_out" },
  ]);
  backend.values.set("useListEventCloseout", [
    {
      _id: "closeout-a",
      eventId: "event-a",
      version: 3,
      status: "finalized",
      finalizedAt: 1,
      revision: 1,
      actualRevenue: 4200,
      totalActualCost: 1500,
      grossProfit: 2700,
      actualHeadcount: 1,
    },
  ]);
  sourcesFor({
    _id: "closeout-a",
    version: 3,
    status: "finalized",
    revision: 1,
  });
  backend.values.set("closeoutSources:closeoutResults", [
    {
      revision: 1,
      kind: "finalized",
      reason: null,
      at: Date.UTC(2026, 9, 1),
      actualRevenue: 4200,
      totalActualCost: 1500,
      grossProfit: 2700,
      actualHeadcount: 1,
      sourceSnapshot: "{}",
    },
  ]);
  const correct = command("closeoutSources:correctCloseoutFromSources", {
    closeoutId: "closeout-a",
  });
  await mount(createElement(CloseoutPage));
  await click(button("Show finalized"));
  await click(button("Correct"));
  expect(
    container.querySelector('[data-testid="closeout-results"]')?.textContent,
  ).toContain("Version 1");

  input("entered.ingredient", "700");
  input("entered.labor", "950");
  input("reason", "Late produce invoice");
  await submit(button("Save correction").closest("form")!);
  expect(correct).toHaveBeenCalledWith({
    closeoutId: "closeout-a",
    reason: "Late produce invoice",
    entered: { ingredient: 700, labor: 950 },
  });
});
