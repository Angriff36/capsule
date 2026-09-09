// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it, vi } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  field,
  button,
  click,
  submit,
  change,
} from "./support/mounted-app";
import { DishIngredientsPanel } from "../src/features/kitchen/DishIngredientsPanel";
import { DishPrepTasksPanel } from "../src/features/kitchen/DishPrepTasksPanel";

function ingredient() {
  backend.values.set("useListDishIngredient", [
    {
      _id: "line-a",
      dishId: "dish-a",
      ingredientId: "salt",
      quantity: 0.5,
      unit: "ounce",
      version: 7,
    },
  ]);
  backend.values.set("useListIngredient", [{ _id: "salt", name: "Sea salt" }]);
}

it("keeps an ingredient on cancel or form submission, rejects click-through, then removes only on an armed confirmation", async () => {
  vi.useFakeTimers();
  try {
    ingredient();
    const remove = command("useDishIngredientRemove");
    await mount(createElement(DishIngredientsPanel, { dishId: "dish-a" }));
    const row = container.querySelector('[data-testid="dish-ingredient-row"]')!;
    await click(button("Remove", row));
    let prompt = container.querySelector<HTMLFormElement>(
      "[data-action-prompt]",
    )!;
    expect(button("Remove", prompt).disabled).toBe(true);
    await click(button("Remove", prompt));
    expect(remove).not.toHaveBeenCalled();
    await click(
      prompt.querySelector<HTMLButtonElement>(
        '[data-testid="action-prompt-cancel"]',
      )!,
    );
    expect(remove).not.toHaveBeenCalled();
    expect(row.textContent).toContain("Sea salt");
    await click(button("Remove", row));
    prompt = container.querySelector<HTMLFormElement>("[data-action-prompt]")!;
    await act(async () => vi.advanceTimersByTime(1000));
    await submit(prompt);
    expect(remove).not.toHaveBeenCalled();
    expect(button("Remove", prompt).disabled).toBe(false);
    await click(button("Remove", prompt));
    expect(remove).toHaveBeenCalledExactlyOnceWith({
      docId: "line-a",
      version: 7,
      reason: "Removed from dish",
    });
    expect(container.textContent).toContain("Ingredient removed.");
  } finally {
    vi.useRealTimers();
  }
});

it("saves the entered recipe quantity and unit without removing the ingredient", async () => {
  ingredient();
  const adjust = command("useDishIngredientAdjustQuantity");
  const remove = command("useDishIngredientRemove");
  await mount(createElement(DishIngredientsPanel, { dishId: "dish-a" }));
  const form = container.querySelector(
    '[data-testid="dish-ingredient-row"] form',
  )!;
  input("quantity", "1.25", form);
  input("unit", "gram", form);
  await click(button("Save qty", form));
  expect(adjust).toHaveBeenCalledExactlyOnceWith({
    docId: "line-a",
    version: 7,
    quantity: 1.25,
    unit: "gram",
  });
  expect(remove).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Quantity saved.");
  input("quantity", "-1", form);
  await click(button("Save qty", form));
  expect(adjust).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("greater than zero");
});

it("converts a batch prep quantity to per-guest storage and retains only the intended defaults for the next task", async () => {
  const add = command("useCreateDishTask");
  await mount(createElement(DishPrepTasksPanel, { dishId: "dish-a" }));
  input("name", "Roast carrots");
  input("station", "Oven");
  input("instructions", "Weight after cooking");
  input("batchTotal", "97.5");
  input("batchServings", "260");
  const selects = [...container.querySelectorAll("select")];
  const unit = selects.find((select) =>
    [...select.options].some((option) => option.value === "pound"),
  )!;
  change(unit, "pound");
  await submit(container.querySelector("form")!);
  expect(add).toHaveBeenCalledExactlyOnceWith({
    dishId: "dish-a",
    name: "Roast carrots",
    station: "Oven",
    instructions: "Weight after cooking",
    category: "Finish at Event",
    defaultQuantity: 0.375,
    defaultUnit: "pound",
    sortOrder: 0,
  });
  expect(field("name").value).toBe("");
  expect(field("station").value).toBe("");
  expect(field("instructions").value).toBe("");
  expect(field("batchTotal").value).toBe("");
  expect(field("batchServings").value).toBe("260");
  expect(unit.value).toBe("pound");
  input("name", "Second batch");
  input("batchTotal", "10");
  input("batchServings", "0");
  await submit(container.querySelector("form")!);
  expect(add).toHaveBeenCalledTimes(1);
});
