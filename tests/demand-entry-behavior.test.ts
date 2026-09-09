// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  button,
  click,
} from "./support/mounted-app";
import { DemandLedgerPage } from "../src/features/inventory/DemandLedgerPage";
it("calculates an ingredient demand with the chosen event, ingredient, quantity and unit", async () => {
  backend.values.set("useListEvent", [{ _id: "event-a", title: "Supper" }]);
  backend.values.set("useListIngredient", [
    { _id: "ingredient-a", name: "Carrots", unit: "pound", status: "active" },
  ]);
  const calculate = command("useCreateIngredientDemand");
  await mount(createElement(DemandLedgerPage));
  await click(button("Calculate demand", container.querySelector("header")!));
  input("eventId", "event-a");
  await click(container.querySelector<HTMLElement>('[role="option"]')!);
  input("requiredQuantity", "12.5");
  input("unit", "pound");
  await click(button("Calculate"));
  expect(calculate).toHaveBeenCalledExactlyOnceWith({
    eventId: "event-a",
    ingredientId: "ingredient-a",
    requiredQuantity: 12.5,
    unit: "pound",
  });
});
