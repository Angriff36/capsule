// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import {
  MenuSheet,
  type EventDayDetailData,
} from "../src/features/eventDay/EventDaySheetSections";
import { EventAllergenBriefingPage } from "../src/features/events/EventAllergenBriefingPage";
import { encodeEventMenuLineFields } from "../src/features/events/eventMenuLineFields";
import { buildBeoPdf } from "../src/features/events/beoPdf";
import { buildMenuPdf } from "../src/features/kitchen/menuPdf";
import type { Doc } from "../src/lib/api";

const eventId = "nn7ez3fz56ya246m6p17az2ad58crnwg";
const specialInstructions = encodeEventMenuLineFields({
  containerCount: 1,
  notes: "Keep extra spicy",
});
const dish = { _id: "dish-a", name: "Flour tortillas" };
const selection = {
  _id: "selection-a",
  eventId,
  dishId: dish._id,
  quantityServings: 40,
  specialInstructions,
};
it("renders human menu notes and warns about unverified allergens on the service sheet", async () => {
  const data = {
    eventDishes: [selection],
    dishes: [dish],
    dishIngredients: [
      {
        _id: "line-a",
        dishId: dish._id,
        ingredientId: "flour",
        ingredient: { name: "Flour", allergens: [] },
      },
    ],
    dishComponents: [],
    componentIngredients: [],
  } as unknown as EventDayDetailData;
  await mount(createElement(MenuSheet, { data }));
  expect(container.textContent).toContain("Keep extra spicy");
  expect(container.textContent).not.toContain("@capsule.menu");
  expect(container.textContent).toContain(
    "Allergens unverified — ingredient flags not set",
  );
  expect(container.textContent).not.toContain("No allergens");
  await mount(
    createElement(MenuSheet, {
      data: {
        ...data,
        dishIngredients: [
          {
            ...data.dishIngredients[0],
            ingredient: { name: "Flour", allergens: ["wheat"] },
          },
        ],
      },
    }),
  );
  expect(container.textContent).toContain("Wheat");
  expect(container.textContent).not.toContain("Allergens unverified");
});
it("keeps internal packing metadata out of the allergen briefing and generated menu/BEO PDFs", async () => {
  const event = {
    _id: eventId,
    title: "Harborview supper",
    eventType: "dinner",
    stage: "planning",
    expectedHeadcount: 40,
  };
  backend.values.set("useGetEvent", event);
  backend.values.set("useListEventDish", [selection]);
  backend.values.set("useListDish", [dish]);
  await mount(
    createElement(
      Routes,
      null,
      createElement(Route, {
        path: "/events/:id/allergen-briefing",
        element: createElement(EventAllergenBriefingPage),
      }),
    ),
    `/events/${eventId}/allergen-briefing`,
  );
  expect(container.textContent).toContain("Keep extra spicy");
  expect(container.textContent).not.toContain("@capsule.menu");
  const branding = {
    displayName: "Test Catering",
    address: "",
    primaryColor: "#233E35",
    accentColor: "#BE773F",
  };
  const beo = buildBeoPdf({
    event,
    clientName: "Harborview",
    dishes: [{ selection, dish }],
    timeline: [],
    staff: [],
    branding,
  });
  const menu = buildMenuPdf({
    menu: { _id: "menu-a", name: "Supper" } as Doc<"menus">,
    dishes: [
      {
        selection: selection as unknown as Doc<"menuDishes">,
        dish: dish as Doc<"dishes">,
      },
    ],
    branding,
  });
  for (const pdf of [beo, menu]) {
    const output = pdf.output();
    expect(output).toContain("Keep extra spicy");
    expect(output).not.toContain("@capsule.menu");
    expect(output).not.toContain("containerCount");
  }
});
