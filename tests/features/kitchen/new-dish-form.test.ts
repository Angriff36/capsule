// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  button,
  change,
  click,
  command,
  container,
  location,
  mount,
} from "../../support/mounted-app";
import { KitchenCatalogPage } from "../../../src/features/kitchen/KitchenCatalogPage";
import { dishFoodKey } from "../../../src/features/kitchen/newDishMatch";

const MAIN = "jd7cf1t17pmj822wqhm65j6sb18f9et1";
const OTHER = "jd7cf1t17pmj822wqhm65j6sb18f9et4";
const NEW_ID = "jd7cf1t17pmj822wqhm65j6sb18f9et9";

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
  dish(MAIN, "Carne Asada", {
    category: "Finish at Kitchen",
    dietaryTags: ["gluten-free"],
  }),
  dish(OTHER, "Short rib", { category: "Finish at Event" }),
];

const nameInput = () =>
  container.querySelector<HTMLInputElement>("#new-dish-name")!;

it("the name check ignores serving tags", () => {
  expect(dishFoodKey("Carne Asada (SEL)")).toBe("carne asada");
  expect(dishFoodKey("Carne Asada - passed")).toBe("carne asada");
  expect(dishFoodKey("Carne Asada - Drop Off")).toBe("carne asada");
  expect(dishFoodKey("Chicken (BBQ)")).not.toBe(dishFoodKey("Chicken"));
});

it("typing a dish already on file shows it, and a serving choice steers to adding a version", async () => {
  backend.values.set("useListDish", rows);
  const create = command("useCreateDish", { docId: NEW_ID });
  const link = command("useDishMakeVersionOf", { ok: true });
  await mount(createElement(KitchenCatalogPage, { section: "dishes" }));
  await click(button("New dish"));

  change(nameInput(), "Carne Asada (SEL)");
  expect(container.textContent).toContain("This dish is already on file");
  expect(container.textContent).toContain("Same food");
  expect(button("Create a separate dish anyway")).toBeDefined();

  await click(button("Drop Off"));
  expect(container.textContent).toContain("Carne Asada is already on file");
  await click(button("Add Drop Off version"));

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Carne Asada - Drop Off" }),
  );
  expect(link).toHaveBeenCalledWith({
    docId: NEW_ID,
    mainDishId: MAIN,
    label: "Drop Off",
  });
  expect(location).toBe(`/kitchen/dishes/${NEW_ID}`);
});

it("a new dish is built from picks, then opens on its own page", async () => {
  backend.values.set("useListDish", rows);
  const create = command("useCreateDish", { docId: NEW_ID });
  await mount(createElement(KitchenCatalogPage, { section: "dishes" }));
  await click(button("New dish"));

  change(nameInput(), "Halibut Taco");
  expect(container.textContent).not.toContain("already on file");
  const categoryField =
    container.querySelector("#new-dish-category")!.parentElement!;
  await click(button("Finish at Event", categoryField));
  await click(button("vegan"));
  await click(button("Create dish"));

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Halibut Taco",
      category: "Finish at Event",
      dietaryTags: ["vegan"],
      portionSize: 1,
      portionUnit: "each",
    }),
  );
  expect(location).toBe(`/kitchen/dishes/${NEW_ID}`);
});
