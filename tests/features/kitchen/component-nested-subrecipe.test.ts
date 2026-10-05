// @vitest-environment jsdom
// AC-066 / AC-069 — nested recipes from the normal screens: the recipe book
// adds a sub-recipe and shows a loop refusal that names the recipes; the
// import review classifies ingredient, sub-recipe and method lines, links a
// sub-recipe from the book, and stores that link when the review is saved.
// Convex is mocked at the hook layer; the stored graph is proven in
// tests/proofs/nested-recipe-import.runtime.test.ts.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ComponentSubRecipesPanel } from "../../../src/features/kitchen/ComponentSubRecipesPanel";
import { ComponentImportPage } from "../../../src/features/kitchen/import/ComponentImportPage";
import { nestedRecipeLoop } from "../../../convex/culinaryDemand";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MAC = "j39h6k2m8p4q7r1s5t9w3x2y6";
const ALFREDO = "j39h6k2m8p4q7r1s5t9w3x2y7";

const harness = vi.hoisted(() => ({
  addLine: vi.fn(),
  reconcile: vi.fn(async () => null),
  createReview: vi.fn(),
  nestedLines: [] as unknown[],
  recipes: [] as { _id: string; name: string; deletedAt: null }[],
  ingredients: [] as { _id: string; name: string; deletedAt: null }[],
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(async () => null),
}));

vi.mock("../../../src/lib/culinaryDemandClient", () => ({
  useAddNestedRecipeLine: () => harness.addLine,
  useReconcileLiveEventsForComponent: () => harness.reconcile,
}));

vi.mock("../../../src/lib/safeCulinaryOperations", () => ({
  useImportComponentSafely: () => vi.fn(),
  useCreateComponentImportReview: () => harness.createReview,
  useSaveComponentImportReview: () => vi.fn(),
  useRestoreComponentSnapshotSafely: () => vi.fn(),
  useCloneMenuSafely: () => vi.fn(),
}));

vi.mock("../../../src/lib/manifest-convex-react", () => {
  const commandHook = () => vi.fn(async () => ({ docId: "created-1" }));
  return new Proxy(
    {},
    {
      has: () => true,
      get(_target, prop) {
        if (typeof prop !== "string" || prop === "then" || prop === "default")
          return undefined;
        if (prop === "useListComponent") return () => harness.recipes;
        if (prop === "useListComponentComponent")
          return () => harness.nestedLines;
        if (prop === "useListIngredient") return () => harness.ingredients;
        if (prop === "useGetComponentImport") return () => undefined;
        if (prop.startsWith("useList")) return () => [];
        return commandHook;
      },
    },
  );
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  harness.addLine.mockReset();
  harness.reconcile.mockClear();
  harness.createReview.mockReset();
  harness.nestedLines = [];
  harness.recipes = [
    { _id: MAC, name: "Mac sauce", deletedAt: null },
    { _id: ALFREDO, name: "Alfredo sauce", deletedAt: null },
  ];
  harness.ingredients = [
    { _id: "ing-cream", name: "Heavy cream", deletedAt: null },
  ];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(element: ReturnType<typeof createElement>) {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, element));
  });
}

function setValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      }),
    );
  });
}

async function click(label: string, index = 0) {
  await act(async () => {
    Array.from(container.querySelectorAll("button"))
      .filter((button) => button.textContent === label)
      [index]?.click();
  });
}

describe("recipe book sub-recipes", () => {
  it("adds a nested subrecipe through the recipe book UI and rejects a cycle with the affected recipe named", async () => {
    harness.addLine.mockResolvedValueOnce({ docId: "nested-1" });
    await render(createElement(ComponentSubRecipesPanel, { componentId: MAC }));
    const form = container.querySelector("form.culinary-line-form")!;
    setValue(form.querySelector("select[name=childComponentId]")!, ALFREDO);
    setValue(form.querySelector("input[name=quantity]")!, "2");
    setValue(form.querySelector("select[name=unit]")!, "gallon");
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(harness.addLine).toHaveBeenCalledWith(
      expect.objectContaining({
        componentId: MAC,
        childComponentId: ALFREDO,
        quantity: 2,
        unit: "gallon",
      }),
    );
    // Demand for live events follows the recipe change.
    expect(harness.reconcile).toHaveBeenCalledWith(MAC);

    harness.addLine.mockRejectedValueOnce(
      new Error(
        "Alfredo sauce already uses Mac sauce (Alfredo sauce → Mac sauce), so it cannot go inside Mac sauce. That would make a loop. Pick a different recipe.",
      ),
    );
    setValue(form.querySelector("select[name=childComponentId]")!, ALFREDO);
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    const alert = container.querySelector("[role=alert]");
    expect(alert?.textContent).toContain(
      "Alfredo sauce already uses Mac sauce",
    );
    // A refused add leaves the form usable for another pick.
    expect(
      container.querySelector<HTMLButtonElement>("form button")?.disabled,
    ).toBe(false);
  });

  it("finds the loop chain the server names, and ignores recipes outside it", () => {
    const children = new Map([
      ["alfredo", ["roux"]],
      ["roux", ["mac"]],
      ["salad", ["dressing"]],
    ]);
    // Putting Alfredo inside Mac would loop: Alfredo → Roux → Mac.
    expect(nestedRecipeLoop(children, "mac", "alfredo")).toEqual([
      "alfredo",
      "roux",
      "mac",
    ]);
    // An unrelated recipe is free to use it.
    expect(nestedRecipeLoop(children, "salad", "alfredo")).toBeNull();
  });
});

const SOURCE = `Mac and cheese bake
Yield: 2 pan

Ingredients:
1 qt heavy cream
2 gal Alfredo sauce (see recipe)
Sub-recipe: 1 qt garlic confit
Mix it all

Method:
1. Bake at 350 for 30 minutes.
`;

describe("recipe import review with sub-recipes", () => {
  it("classifies ingredient, sub-recipe and method lines and saves the sub-recipe link", async () => {
    harness.createReview.mockResolvedValue({
      importId: "k57wg2c8v4b6n1m3x9q7t5j2d4",
      reviewRevision: 0,
      lineIds: ["l1", "l2", "l3", "l4"],
    });
    await render(createElement(ComponentImportPage));
    setValue(
      container.querySelector<HTMLTextAreaElement>("#component-import-source")!,
      SOURCE,
    );
    await click("Parse");
    const review = container.querySelector("[aria-label='Structured review']")!;
    const statuses = Array.from(
      review.querySelectorAll(".component-import-status"),
    ).map((node) => node.textContent);
    // Cream matches an ingredient; Alfredo links the book recipe; the garlic
    // confit is marked a recipe but is not in the book, so it waits for a
    // pick; "Mix it all" is a method step still sitting in the list.
    expect(statuses).toEqual([
      "Exact match",
      "Sub-recipe",
      "Needs review",
      "New ingredient",
    ]);
    const pickers = Array.from(
      review.querySelectorAll<HTMLSelectElement>("select"),
    ).filter((select) =>
      select.closest("label")?.textContent?.includes("Recipe from the book"),
    );
    expect(pickers).toHaveLength(2);
    expect(pickers[0].value).toBe(ALFREDO);
    expect(pickers[1].value).toBe("");
    expect(review.textContent).toContain(
      "If it is not in the book yet, add it there first",
    );

    // The cook keeps the garlic confit as an ingredient and moves the stray
    // step into the method.
    await click("Treat as an ingredient", 1);
    await click("Move to method", 3);
    const method = Array.from(review.querySelectorAll("textarea")).find(
      (area) => area.closest("label")?.textContent?.includes("Instructions"),
    );
    expect(method?.value).toContain("Mix it all");
    expect(method?.value).toContain("Bake at 350");
    expect(
      review.querySelectorAll(".component-import-lines > li"),
    ).toHaveLength(3);

    await click("Save review");
    const request = harness.createReview.mock.calls[0][0] as {
      source: { rawText: string };
      lines: {
        sourceLine: string;
        parsedIngredientName?: string;
        match?: { matchStatus: string; matchedComponentId?: string };
      }[];
    };
    // The original source is kept exactly as pasted.
    expect(request.source.rawText).toBe(SOURCE);
    expect(request.lines.map((line) => line.match?.matchStatus)).toEqual([
      "exact",
      "subrecipe",
      undefined,
    ]);
    expect(request.lines[1]).toMatchObject({
      sourceLine: "2 gal Alfredo sauce (see recipe)",
      parsedIngredientName: "Alfredo Sauce",
      match: { matchStatus: "subrecipe", matchedComponentId: ALFREDO },
    });
  });
});
