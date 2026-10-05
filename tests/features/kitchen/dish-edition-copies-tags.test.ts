// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  mount,
} from "../../support/mounted-app";
import { DishDetailPage } from "../../../src/features/kitchen/DishDetailPage";

// The page only reads ids shaped like a real record id.
const DISH = "jd7cf1t17pmj822wqhm65j6sb18f9et8";
const COPY = "jd7cf1t17pmj822wqhm65j6sb18f9et9";

it("a new edition of a dish keeps its dietary tags and allergens, and the page shows them (AC-050, #146)", async () => {
  backend.values.set("useGetDish", {
    _id: DISH,
    name: "Short rib",
    portionSize: 8,
    portionUnit: "oz",
    category: "Entree",
    course: "main",
    dietaryTags: ["gluten-free", "dairy-free"],
    allergenSummary: ["soy"],
    editionNumber: 1,
    version: 3,
    status: "active",
  });
  const createDish = command("useCreateDish", COPY);
  const linkAsEdition = command("useDishLinkAsEdition", { version: 2 });
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

  // Dietary tags are shown on the dish, not accepted and dropped (#146).
  expect(container.textContent).toContain("gluten-free");

  await click(button("Create new edition"));
  expect(createDish).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Short rib",
      category: "Entree",
      dietaryTags: ["gluten-free", "dairy-free"],
      allergenSummary: ["soy"],
    }),
  );
  expect(linkAsEdition).toHaveBeenCalledWith(
    expect.objectContaining({ docId: COPY, editionNumber: 2 }),
  );
});
