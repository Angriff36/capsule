// @vitest-environment jsdom
// Menu dish lines: staff set the course a dish is served in on this menu
// (needed for "guests pick one" courses), and moving a dish up or down keeps
// its course, service style and notes (updateDetails clears what it is not
// sent). Convex and the prompt are mocked at the hook layer.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuDishManager } from "../../../src/features/kitchen/MenuDishManager";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  updateDetails: vi.fn(async () => null),
  askFields: vi.fn(async () => ({ course: "Entrée" })),
}));

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useCreateMenuDish: () => vi.fn(async () => null),
  useMenuDishRemove: () => vi.fn(async () => null),
  useMenuDishUpdateDetails: () => harness.updateDetails,
}));
// The add-dish picker searches the server; nothing to find in these tests.
vi.mock("../../../src/lib/useDishesByIds", () => ({
  useDishSearch: () => [],
}));
vi.mock("../../../src/ui/action-prompt", () => ({
  useActionPrompt: () => ({
    prompt: { askFields: harness.askFields, askReason: vi.fn() },
    host: null,
  }),
}));
vi.mock("../../../src/features/attachments/DishPrimaryImage", () => ({
  DishPrimaryImage: () => null,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  harness.updateDetails.mockClear();
  harness.askFields.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const lines = [
  {
    _id: "md-1",
    version: 4,
    dishId: "d-1",
    sortOrder: 0,
    course: "Entrée",
    serviceStyle: "Plated",
    specialInstructions: "Sauce on the side",
  },
  { _id: "md-2", version: 2, dishId: "d-2", sortOrder: 1 },
];
const dishes = [
  { _id: "d-1", name: "Salmon" },
  { _id: "d-2", name: "Beef tenderloin", course: "Carving" },
];

async function render() {
  await act(async () =>
    root.render(
      createElement(MenuDishManager, {
        menuId: "menu-1",
        menuStatus: "draft",
        menuDishes: lines,
        dishes,
        onError: vi.fn(),
      }),
    ),
  );
}

const buttonsNamed = (name: string) =>
  [...container.querySelectorAll("button")].filter(
    (b) => b.textContent?.trim() === name,
  );

describe("menu dish course and order", () => {
  it("moving a dish keeps its course, service style and notes", async () => {
    await render();
    await act(async () => buttonsNamed("Down")[0]!.click());
    expect(harness.updateDetails).toHaveBeenCalledWith({
      docId: "md-1",
      version: 4,
      sortOrder: 1,
      course: "Entrée",
      serviceStyle: "Plated",
      specialInstructions: "Sauce on the side",
    });
    expect(harness.updateDetails).toHaveBeenCalledWith({
      docId: "md-2",
      version: 2,
      sortOrder: 0,
      course: undefined,
      serviceStyle: undefined,
      specialInstructions: undefined,
    });
  });

  it("sets the course a dish is served in on this menu", async () => {
    await render();
    // The dish's own course shows when the menu line has none.
    expect(container.textContent).toContain("Carving");
    await act(async () => buttonsNamed("Course")[1]!.click());
    expect(harness.askFields).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [expect.objectContaining({ defaultValue: "Carving" })],
      }),
    );
    expect(harness.updateDetails).toHaveBeenCalledWith({
      docId: "md-2",
      version: 2,
      sortOrder: 1,
      course: "Entrée",
      serviceStyle: undefined,
      specialInstructions: undefined,
    });
  });
});
