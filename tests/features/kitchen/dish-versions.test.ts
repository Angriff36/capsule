// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import {
  backend,
  button,
  change,
  click,
  container,
  mount,
} from "../../support/mounted-app";
import { CulinaryRecordPicker } from "../../../src/features/kitchen/CulinaryRecordPicker";
import { DishDetailPage } from "../../../src/features/kitchen/DishDetailPage";
import { KitchenCatalogPage } from "../../../src/features/kitchen/KitchenCatalogPage";

// The page only reads ids shaped like a real record id.
const MAIN = "jd7cf1t17pmj822wqhm65j6sb18f9et1";
const KITCHEN = "jd7cf1t17pmj822wqhm65j6sb18f9et2";
const DROP = "jd7cf1t17pmj822wqhm65j6sb18f9et3";
const OTHER = "jd7cf1t17pmj822wqhm65j6sb18f9et4";

const dish = (
  _id: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  _id,
  name,
  portionSize: 1,
  portionUnit: "each",
  version: 1,
  status: "active",
  dietaryTags: [],
  allergenSummary: [],
  ...extra,
});

const rows = [
  dish(MAIN, "Halibut Fish Taco"),
  dish(KITCHEN, "Halibut Fish Taco - Finish at Kitchen", {
    versionOfDishId: MAIN,
    versionLabel: "Finish at Kitchen",
  }),
  dish(DROP, "Halibut Fish Taco - Drop Off", {
    versionOfDishId: MAIN,
    versionLabel: "Drop Off",
  }),
  dish(OTHER, "Short rib"),
];

it("a version's page shows the main dish and every version as tabs, with its own tab active", async () => {
  backend.values.set("useListDish", rows);
  backend.values.set("useGetDish", rows[1]);
  await mount(
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/kitchen/dishes/:id",
        element: createElement(DishDetailPage),
      }),
    ),
    `/kitchen/dishes/${KITCHEN}`,
  );

  const tabs = [...container.querySelectorAll('[role="tab"]')];
  expect(tabs.map((tab) => tab.textContent)).toEqual([
    "Main",
    "Drop Off",
    "Finish at Kitchen",
  ]);
  expect(
    tabs.find((tab) => tab.getAttribute("aria-selected") === "true")
      ?.textContent,
  ).toBe("Finish at Kitchen");
  expect(container.textContent).toContain("Make it its own dish");
});

it("the dish list shows main dishes only, notes their versions, and finds a main dish by a version's name", async () => {
  backend.values.set("useListDish", rows);
  await mount(createElement(KitchenCatalogPage, { section: "dishes" }));

  const text = container.textContent ?? "";
  expect(text).toContain("Halibut Fish Taco");
  expect(text).toContain("2 versions");
  expect(text).toContain("Short rib");
  expect(text).not.toContain("Halibut Fish Taco - Drop Off");

  // Searching a version's name finds its main dish.
  change(
    container.querySelector<HTMLInputElement>('[aria-label="Search dishes"]')!,
    "drop off",
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  const found = container.textContent ?? "";
  expect(found).toContain("Halibut Fish Taco");
  expect(found).not.toContain("Short rib");
});

it("adding a dish with versions asks which version, and adds that version", async () => {
  const picked: string[] = [];
  await mount(
    createElement(CulinaryRecordPicker, {
      kind: "dish",
      records: rows,
      onSelect: (id: string) => picked.push(id),
    }),
  );
  expect(container.textContent).not.toContain("Halibut Fish Taco - Drop Off");
  expect(container.textContent).toContain("Pick a version:");
  await click(button("Drop Off"));
  expect(picked).toEqual([DROP]);
});
