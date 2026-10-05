// @vitest-environment jsdom
// AC-073 (PR03-08) — kitchen "not counted yet" screens speak plain words:
// names instead of record ids, what is not counted, and that cooking goes on.
// The sentences come from the real unresolvedText. When the scratch folder
// .artifacts/llm-review exists, the rendered text is written there for the
// llm-review judgment.
import { existsSync, writeFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { unresolvedText } from "../../../convex/lib/culinaryModel/unresolvedText";
import type { UnresolvedItem } from "../../../convex/lib/culinaryModel/demand";
import { KitchenUnresolvedWorkPage } from "../../../src/features/kitchen/KitchenUnresolvedWorkPage";
import { EventUnresolvedMaterialsNotice } from "../../../src/features/events/EventUnresolvedMaterialsNotice";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const names = {
  components: new Map([
    ["cmp-alfredo", { name: "Alfredo sauce" }],
    ["cmp-roux", { name: "Roux" }],
    ["cmp-dijon", { name: "Dijon vinaigrette" }],
  ]),
  dishes: new Map([
    ["dish-mac", { name: "Mac and cheese" }],
    ["dish-salad", { name: "House salad" }],
    ["dish-linen", { name: "Linen package" }],
  ]),
  removedNames: new Map([["k57wg2c8v4b6n1m3x9q7t5j2d4", "Garlic confit"]]),
} as never;

const raw: UnresolvedItem[] = [
  {
    kind: "cycle",
    eventDishId: "ed-1",
    dishId: "dish-mac",
    refId: "cmp-alfredo",
    label: "Alfredo sauce",
    detail: "recipe cycle: cmp-alfredo -> cmp-roux -> cmp-alfredo",
  },
  {
    kind: "missing_reference",
    eventDishId: "ed-1",
    dishId: "dish-mac",
    refId: "k57wg2c8v4b6n1m3x9q7t5j2d4",
    label: "k57wg2c8v4b6n1m3x9q7t5j2d4",
    detail: "sub-recipe not found",
  },
  {
    kind: "recipe_content",
    eventDishId: "ed-2",
    dishId: "dish-salad",
    refId: "cmp-dijon",
    label: "Dijon vinaigrette",
    detail: "recipe has no ingredients and no method on file",
  },
  {
    kind: "unit",
    eventDishId: "ed-2",
    dishId: "dish-salad",
    refId: "src-1",
    label: "Olive oil",
    detail: "2 cup cannot convert to catalog unit pound (no_density)",
  },
  {
    kind: "basis",
    eventDishId: "ed-1",
    dishId: "dish-mac",
    refId: "src-2",
    label: "Bacon",
    detail: "3 pound stated as cooked weight; no confirmed yield",
  },
  {
    kind: "choice_pending",
    eventDishId: "ed-2",
    dishId: "dish-salad",
    refId: "task-1",
    label: "Croutons",
    detail: "choose: make / portion",
  },
  {
    kind: "supply_kind",
    eventDishId: "ed-3",
    dishId: "dish-linen",
    refId: "dish-linen",
    label: "Linen package",
    detail: "supply dish: no food demand",
  },
];
const items = raw.map((item) => ({
  ...item,
  text: unresolvedText(item, names),
}));

const harness = vi.hoisted(() => ({
  report: undefined as unknown,
  review: undefined as unknown,
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(async () => null),
}));

vi.mock("../../../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => ({ role: "kitchen_staff" }),
}));

vi.mock("../../../src/lib/culinaryDemandClient", async (importActual) => ({
  ...(await importActual<object>()),
  useKitchenUnresolvedReport: () => harness.report,
  useEventDemandReview: () => harness.review,
  useReconcileEventDemand: () => vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  harness.report = {
    events: [
      {
        eventId: "ev-1",
        eventName: "Monasmith wedding",
        startsAt: Date.UTC(2026, 9, 3),
        unresolved: items,
        purchasingComplete: false,
      },
    ],
    recipes: [
      {
        componentId: "cmp-dijon",
        name: "Dijon vinaigrette",
        contentStatus: "both_missing",
        costConfidence: "none",
        knownSubtotal: 0,
        unknownLines: 0,
      },
      {
        componentId: "cmp-alfredo",
        name: "Alfredo sauce",
        contentStatus: "method_missing",
        costConfidence: "partial",
        knownSubtotal: 20,
        unknownLines: 1,
      },
    ],
  };
  harness.review = {
    eventId: "ev-1",
    eventDishes: [{ unresolved: items }],
    purchasing: { complete: false },
    unresolvedCount: items.length,
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderText(element: ReturnType<typeof createElement>) {
  await act(async () => {
    root.render(createElement(MemoryRouter, null, element));
  });
  return (container.innerText || container.textContent || "").trim();
}

function readable(node: Element): string {
  // Block elements on their own lines, like a reader sees them.
  return Array.from(node.querySelectorAll("h1,h2,p,li,th,td,a,button,span"))
    .filter(
      (el) =>
        !el.querySelector("h1,h2,p,li,th,td") &&
        !el.parentElement?.closest("h1,h2,p,li,th,td,a,button,span"),
    )
    .map((el) => el.textContent?.trim())
    .filter(Boolean)
    .join("\n");
}

describe("kitchen unresolved screens use plain words", () => {
  it("shows names and what is not counted, never record ids or code words", async () => {
    await renderText(createElement(KitchenUnresolvedWorkPage));
    const page = readable(container);
    await renderText(
      createElement(EventUnresolvedMaterialsNotice, { eventId: "ev-1" }),
    );
    const notice = readable(container);
    for (const text of [page, notice]) {
      expect(text).toContain(
        "Alfredo sauce ends up inside itself: Alfredo sauce uses Roux, and Roux uses Alfredo sauce.",
      );
      expect(text).toContain(
        "Garlic confit, a sub-recipe used on Mac and cheese, was removed from the recipe book",
      );
      expect(text).toContain("Cooks can still see and do the task.");
      expect(text).toContain(
        "Olive oil: the recipe asks for 2 cups, but it is bought by the pound. Add how many cups make one pound so it can be counted.",
      );
      expect(text).not.toMatch(/k57wg|cmp-|no_density|recipe cycle|->|→/);
    }
    expect(page).toContain("Partly priced");
    expect(page).toContain("Not priced");
    expect(page).toContain("Nothing here stops the kitchen from cooking");
    if (existsSync(".artifacts/llm-review")) {
      writeFileSync(
        ".artifacts/llm-review/PR03-08-rendered.txt",
        `KITCHEN UNRESOLVED WORK PAGE\n\n${page}\n\nEVENT PREP TAB NOTICE (kitchen staff)\n\n${notice}\n`,
      );
    }
  });
});
