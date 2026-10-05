// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  button,
  change,
  click,
  command,
  container,
  input,
  location,
  mount,
} from "../../support/mounted-app";
import { KitchenCatalogPage } from "../../../src/features/kitchen/KitchenCatalogPage";
import {
  dietTag,
  dishFoodKey,
  menuCategory,
} from "../../../src/features/kitchen/newDishMatch";

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
    category: "Apps - Passed - Finish at Event",
    dietaryTags: ["gluten free", "pizza", "sel24"],
  }),
  dish(OTHER, "Short rib", { category: "Finish at Kitchen" }),
];

const nameInput = () =>
  container.querySelector<HTMLInputElement>("#new-dish-name")!;

it("the name check ignores serving tags", () => {
  expect(dishFoodKey("Carne Asada (SEL)")).toBe("carne asada");
  expect(dishFoodKey("Carne Asada - passed")).toBe("carne asada");
  expect(dishFoodKey("Carne Asada - Drop Off")).toBe("carne asada");
  expect(dishFoodKey("Chicken (BBQ)")).not.toBe(dishFoodKey("Chicken"));
});

it("category picks drop timing and serving words; diet tags are written one way", () => {
  expect(menuCategory("Apps - Passed - Finish at Event")).toBe("Apps");
  expect(menuCategory("Action Station - Street Taco")).toBe("Street Taco");
  expect(menuCategory("Finish at Kitchen")).toBeUndefined();
  expect(dietTag("Gluten Free")).toBe("gluten-free");
  expect(dietTag("dairy free")).toBe("dairy-free");
});

it("typing a dish already on file shows it, and Add as a version makes a custom tab", async () => {
  backend.values.set("useListDish", rows);
  const create = command("useCreateDish", { docId: NEW_ID });
  const link = command("useDishMakeVersionOf", { ok: true });
  const finish = command("useDishSetFinishTiming", {});
  await mount(createElement(KitchenCatalogPage, { section: "dishes" }));
  await click(button("New dish"));

  change(nameInput(), "Carne Asada (SEL)");
  expect(container.textContent).toContain("This dish is already on file");
  expect(container.textContent).toContain("Same food");
  expect(button("Create a separate dish anyway")).toBeDefined();
  // Service style is set on the event, not on the dish.
  expect(container.textContent).not.toContain("Service style");

  await click(button("Finish at Event"));
  await click(button("Add as a version"));
  // The tab name starts at the timing, and any name is allowed.
  expect(
    container.querySelector<HTMLInputElement>('[name="label"]')!.value,
  ).toBe("Finish at Event");
  input("label", "Mini");
  await act(() => new Promise((resolve) => setTimeout(resolve, 450)));
  await click(button("Add version"));

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ name: "Carne Asada - Mini" }),
  );
  expect(link).toHaveBeenCalledWith({
    docId: NEW_ID,
    mainDishId: MAIN,
    label: "Mini",
  });
  expect(finish).toHaveBeenCalledWith({
    docId: NEW_ID,
    timing: "finish_at_event",
  });
  expect(location).toBe(`/kitchen/dishes/${NEW_ID}`);
});

it("a new dish is built from picks, saves how it is served, then opens on its own page", async () => {
  backend.values.set("useListDish", rows);
  backend.values.set("useListDishContainer", [
    { _id: "c1", dishId: OTHER, name: "Full hotel pan", deletedAt: null },
  ]);
  const create = command("useCreateDish", { docId: NEW_ID });
  const instructions = command("useDishSaveServiceInstructions", {});
  const pan = command("useCreateDishContainer", { docId: "c2" });
  const finish = command("useDishSetFinishTiming", {});
  await mount(createElement(KitchenCatalogPage, { section: "dishes" }));
  await click(button("New dish"));

  change(nameInput(), "Halibut Taco");
  expect(container.querySelector('[aria-label="Already on file"]')).toBeNull();
  // Only real diet tags; catalog junk is not offered.
  const diet = [...container.querySelectorAll("fieldset")].find(
    (set) => set.querySelector("legend")?.textContent === "Dietary",
  )!;
  expect(
    [...diet.querySelectorAll("button")].map((b) => b.textContent),
  ).toEqual(["vegan", "vegetarian", "gluten-free", "dairy-free", "nut-free"]);
  await click(button("Apps"));
  await click(button("Finish at Event"));
  await click(button("gluten-free"));
  change(
    container.querySelector<HTMLTextAreaElement>(
      'textarea[placeholder^="For example: Set on the buffet"]',
    )!,
    "Top with lime.",
  );
  await click(button("Full hotel pan"));
  await click(button("Create dish"));

  expect(create).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Halibut Taco",
      category: "Apps",
      dietaryTags: ["gluten-free"],
      portionSize: 1,
      portionUnit: "each",
    }),
  );
  expect(instructions).toHaveBeenCalledWith({
    docId: NEW_ID,
    instructions: "Top with lime.",
    source: "manual",
  });
  expect(pan).toHaveBeenCalledWith({
    dishId: NEW_ID,
    name: "Full hotel pan",
    serviceMethod: "cooked_on_site",
    servingsPerContainer: 25,
    baseQuantity: 0,
  });
  expect(finish).toHaveBeenCalledWith({
    docId: NEW_ID,
    timing: "finish_at_event",
  });
  expect(create.mock.calls[0]![0]).not.toHaveProperty("serviceStyle");
  expect(location).toBe(`/kitchen/dishes/${NEW_ID}`);
});
