// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  field,
  button,
  click,
  change,
  submit,
} from "./support/mounted-app";
import { EventMenuTab } from "../src/features/events/EventMenuTab";
import { EventMarginTab } from "../src/features/events/EventMarginTab";
import { EventPrepTab } from "../src/features/events/EventPrepTab";

function menu() {
  backend.values.set("useGetEvent", {
    _id: "event-a",
    title: "Garden dinner",
    stage: "planning",
    expectedHeadcount: 40,
    quotedPrice: 1000,
  });
  backend.values.set("useListDish", [
    { _id: "dish-a", name: "Roast carrots", status: "active" },
  ]);
  backend.values.set("useListEventDish", [
    {
      _id: "menu-a",
      eventId: "event-a",
      dishId: "dish-a",
      quantityServings: 40,
      course: "Side",
      serviceStyle: "plated",
      version: 7,
    },
  ]);
  backend.values.set("useListDishIngredient", [
    {
      _id: "line-a",
      dishId: "dish-a",
      ingredientId: "carrot",
      quantity: 0.25,
      unit: "pound",
      addedAt: 1,
      version: 3,
    },
  ]);
  backend.values.set("useListIngredient", [
    {
      _id: "carrot",
      name: "Carrots",
      unit: "pound",
      costPerUnit: 8,
      status: "active",
    },
    {
      _id: "butter",
      name: "Butter",
      unit: "ounce",
      costPerUnit: 1,
      status: "active",
    },
  ]);
  backend.values.set("useListDishContainer", [
    {
      _id: "pan-a",
      dishId: "dish-a",
      name: "Hotel pan",
      servingsPerContainer: 20,
      status: "active",
    },
  ]);
}
const page = () =>
  createElement(EventMenuTab, { eventId: "event-a", expectedHeadcount: 40 });

it("calculates displayed menu cost and pans from the recipe, and saves course plus inline recipe edits", async () => {
  menu();
  const course = command("useEventDishChangeCourse");
  const adjust = command("useDishIngredientAdjustQuantity");
  const update = command("useEventDishUpdateInstructions");
  await mount(page());
  const stats = container.querySelector(
    '[data-testid="event-menu-food-cost"]',
  )!;
  expect(stats.textContent).toContain("$80.00");
  expect(stats.textContent).toContain("$2.00 per guest");
  expect(container.textContent).toContain("2 Hotel pan");
  input("course", "Main");
  await submit(field("course").closest("form")!);
  expect(update).toHaveBeenCalledExactlyOnceWith({
    docId: "menu-a",
    version: 7,
    specialInstructions: '@capsule.menu {"containerCount":2}',
  });
  expect(course).toHaveBeenCalledExactlyOnceWith({
    docId: "menu-a",
    version: 8,
    course: "Main",
    serviceStyle: "plated",
  });
  await click(button("Edit recipe on this menu"));
  const editor = container.querySelector(
    '[data-testid="event-menu-recipe-editor"]',
  )!;
  expect(editor.textContent).toContain("2 × Hotel pan (20 servings each)");
  const quantity = editor.querySelector<HTMLInputElement>(
    '[data-testid="event-menu-recipe-qty"]',
  )!;
  change(quantity, "0.5");
  await click(button("Save qty", quantity.closest("form")!));
  expect(adjust).toHaveBeenCalledExactlyOnceWith({
    docId: "line-a",
    version: 3,
    quantity: 0.5,
    unit: "pound",
  });
});

it("warns about incompatible recipe units and excludes that line from the priced estimate", async () => {
  menu();
  backend.values.set("useListDishIngredient", [
    {
      _id: "line-a",
      dishId: "dish-a",
      ingredientId: "carrot",
      quantity: 2,
      unit: "each",
      addedAt: 1,
      version: 3,
    },
  ]);
  await mount(page());
  expect(
    container.querySelector('[data-testid="event-menu-unit-mismatch"]')
      ?.textContent,
  ).toContain("These units are not converted");
  expect(
    container.querySelector('[data-testid="event-menu-food-cost"]')
      ?.textContent,
  ).toContain("$0.00");
  await click(button("Edit recipe on this menu"));
  expect(
    container.querySelector(
      '[data-testid="event-menu-recipe-editor"] [data-testid="event-menu-unit-mismatch"]',
    )?.textContent,
  ).toContain("each");
});

it("searches the live ingredient catalog, adds the selected amount, and creates a default 20-serving pan", async () => {
  menu();
  const add = command("useCreateDishIngredient");
  const pan = command("useCreateDishContainer");
  await mount(page());
  await click(button("Edit recipe on this menu"));
  const search = field("eventMenuRecipeCatalogSearch");
  await act(async () => search.focus());
  input("eventMenuRecipeCatalogSearch", "But");
  expect(
    container.querySelector(
      '[data-testid="event-menu-recipe-ingredient-results"]',
    )?.textContent,
  ).toBe("Butter");
  await click(button("Butter"));
  const addQuantity = container.querySelector<HTMLInputElement>(
    '[data-testid="event-menu-recipe-add-qty"]',
  )!;
  expect(document.activeElement).toBe(addQuantity);
  change(addQuantity, "0.125");
  await click(button("Add ingredient"));
  expect(add).toHaveBeenCalledExactlyOnceWith({
    dishId: "dish-a",
    ingredientId: "butter",
    quantity: 0.125,
    unit: "ounce",
    sortOrder: 1,
  });
  input("containerName", "Half pan");
  expect(field("servingsPerContainer").value).toBe("20");
  await click(button("Add container"));
  expect(pan).toHaveBeenCalledExactlyOnceWith({
    dishId: "dish-a",
    name: "Half pan",
    serviceMethod: "cooked_at_kitchen",
    servingsPerContainer: 20,
    baseQuantity: 0,
  });
});

it("creates and links an ingredient from the always-available inline form without a catalog search", async () => {
  menu();
  const create = command("useCreateIngredient", { docId: "new-ingredient" });
  const add = command("useCreateDishIngredient");
  await mount(page());
  await click(button("Edit recipe on this menu"));
  expect(field("eventMenuRecipeCatalogSearch").value).toBe("");
  await click(button("Create ingredient"));
  input("newIngredientName", "Saffron");
  input("newIngredientUnit", "gram");
  input("newIngredientCost", "12");
  input("createQuantity", "0.02");
  await click(button("Create and add"));
  expect(create).toHaveBeenCalledExactlyOnceWith({
    name: "Saffron",
    unit: "gram",
    costPerUnit: 12,
  });
  expect(add).toHaveBeenCalledExactlyOnceWith({
    dishId: "dish-a",
    ingredientId: "new-ingredient",
    quantity: 0.02,
    unit: "gram",
    sortOrder: 1,
  });
});

it("includes recipe food cost in the margin view when no purchase order exists", async () => {
  menu();
  await mount(createElement(EventMarginTab, { eventId: "event-a" }));
  expect(container.textContent).toContain("recipe × catalog estimate");
  expect(
    container.querySelector('[data-testid="live-profit-ingredients"]')
      ?.textContent,
  ).toBe("$80");
});

it("drafts an order from the planning menu's needs without sending an event approval", async () => {
  menu();
  backend.values.set("useListIngredientDemand", [
    {
      _id: "need-a",
      eventId: "event-a",
      ingredientId: "carrot",
      requiredQuantity: 10,
      unit: "pound",
      status: "calculated",
    },
  ]);
  backend.values.set("useListVendor", [
    { _id: "vendor-a", name: "Farm", status: "active" },
  ]);
  const draft = command("lib/safeMaterialization:draftPurchaseOrder", {
    vendorOrderId: "order-a",
    lineCount: 1,
  });
  const approve = command("useEventApprove");
  await mount(page());
  await click(button("Draft PO from this event's needs"));
  expect(draft).toHaveBeenCalledTimes(1);
  expect(draft.mock.calls[0][0]).toMatchObject({
    eventId: "event-a",
    vendorId: "vendor-a",
    operationKey: expect.any(String),
    lines: [
      {
        ingredientId: "carrot",
        ingredientDemandId: "need-a",
        orderedQuantity: 10,
        unit: "pound",
        unitCost: 8,
      },
    ],
  });
  expect(approve).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Drafted a PO with 1 line");
  expect(
    container.querySelector('a[href="/inventory/orders/order-a"]'),
  ).not.toBeNull();
});

it.each(["menu", "prep"])(
  "flags suspicious imported recipe quantities on the actual %s tab",
  async (tab) => {
    menu();
    backend.values.set("useListDishIngredient", [
      {
        _id: "line-a",
        dishId: "dish-a",
        ingredientId: "carrot",
        quantity: 2,
        unit: "pound",
        prepNotes: "TPP unit looks wrong",
        addedAt: 1,
        version: 3,
      },
    ]);
    backend.values.set("useListPrepTask", [
      {
        _id: "task-a",
        eventId: "event-a",
        eventDishId: "menu-a",
        dishId: "dish-a",
        name: "Garnish kit",
        quantity: 1,
        unit: "batch",
        status: "pending",
      },
    ]);
    await mount(
      tab === "menu"
        ? page()
        : createElement(EventPrepTab, {
            eventId: "event-a",
            eventStage: "planning",
          }),
    );
    const flags = [
      ...container.querySelectorAll('[data-testid="suspect-prep-quantity"]'),
    ];
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.map((node) => node.textContent).join(" ")).toContain(
      "80 pound of Carrots (~2.00 per guest)",
    );
    expect(flags.map((node) => node.textContent).join(" ")).toContain(
      "not converted",
    );
  },
);
