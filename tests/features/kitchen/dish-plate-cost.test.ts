// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "../../support/mounted-app";
import { DishDetailPage } from "../../../src/features/kitchen/DishDetailPage";

// The page only reads ids shaped like a real record id.
const DISH = "jd7cf1t17pmj822wqhm65j6sb18f9et8";

async function openDish() {
  backend.values.set("useGetDish", {
    _id: DISH,
    name: "Short rib",
    portionSize: 8,
    portionUnit: "oz",
    dietaryTags: [],
    allergenSummary: [],
    version: 1,
    status: "active",
  });
  await mount(
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/kitchen/dishes/:id",
        element: createElement(DishDetailPage),
      }),
    ),
    `/kitchen/dishes/${DISH}`,
  );
  return container.querySelector('[data-testid="dish-plate-cost"]')!
    .textContent;
}

it("the dish page shows a plate cost from its priced lines (#145)", async () => {
  backend.values.set("useListIngredient", [
    { _id: "ing-beef", name: "Beef short rib", unit: "pound", costPerUnit: 8 },
    { _id: "ing-salt", name: "Salt", unit: "pound", costPerUnit: 0 },
  ]);
  backend.values.set("useListDishIngredient", [
    {
      _id: "line-beef",
      dishId: DISH,
      ingredientId: "ing-beef",
      quantity: 0.5,
      unit: "pound",
      addedAt: 1,
    },
  ]);
  expect(await openDish()).toContain("$4.00 per serving");
});

it("an unpriced dish says so instead of showing $0 (#145)", async () => {
  backend.values.set("useListIngredient", [
    { _id: "ing-salt", name: "Salt", unit: "pound", costPerUnit: 0 },
  ]);
  backend.values.set("useListDishIngredient", [
    {
      _id: "line-salt",
      dishId: DISH,
      ingredientId: "ing-salt",
      quantity: 0.01,
      unit: "pound",
      addedAt: 1,
    },
  ]);
  const text = await openDish();
  expect(text).toContain("Ingredients unpriced");
  expect(text).not.toContain("$0.00");
});
