// @vitest-environment jsdom
// AC-451 (BE-9.5): each event menu line says whether its servings follow the
// guest count, which recipe and edition it is made from with the amount and
// batches, links to that recipe, and how many things it still has to settle.
// A role that may not read demand still sees the guest-count line and the
// screen does not break.
import { existsSync, writeFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventMenuLineKitchen } from "../../../src/features/events/EventMenuLineKitchen";
import { EventUnresolvedMaterialsNotice } from "../../../src/features/events/EventUnresolvedMaterialsNotice";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  role: "kitchen_staff",
  review: undefined as unknown,
  enabled: [] as boolean[],
}));

vi.mock("convex/react", () => ({
  useQuery: () => undefined,
  useMutation: () => vi.fn(async () => null),
}));

vi.mock("../../../src/lib/useAuthStatus", () => ({
  useAuthStatus: () => ({ role: harness.role }),
}));

vi.mock("../../../src/lib/culinaryDemandClient", async (importActual) => ({
  ...(await importActual<object>()),
  useEventDemandReview: (_eventId: string, enabled = true) => {
    harness.enabled.push(enabled);
    return enabled ? harness.review : undefined;
  },
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  harness.role = "kitchen_staff";
  harness.enabled = [];
  harness.review = {
    eventId: "ev-1",
    eventDishes: [
      {
        eventDishId: "ed-1",
        recipeNeeds: [
          {
            sourceKey: "rn-1",
            componentId: "cmp-beurre",
            componentName: "Beurre blanc",
            needQuantity: 1.5,
            needUnit: "quart",
            batchesExact: 3,
            editionVersion: 2,
          },
        ],
        unresolved: [
          {
            kind: "unit",
            eventDishId: "ed-1",
            refId: "a",
            label: "",
            detail: "",
          },
          {
            kind: "basis",
            eventDishId: "ed-1",
            refId: "b",
            label: "",
            detail: "",
          },
        ],
      },
    ],
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(followsEventHeadcount: boolean | null) {
  act(() =>
    root.render(
      createElement(
        MemoryRouter,
        null,
        createElement(EventMenuLineKitchen, {
          eventId: "ev-1",
          eventDishId: "ed-1",
          followsEventHeadcount,
        }),
      ),
    ),
  );
  return container.textContent ?? "";
}

describe("event menu line kitchen facts (AC-451)", () => {
  it("shows guest-count rule, recipe edition, amount, batches and things to settle", () => {
    const text = render(true);
    expect(text).toContain("Follows the guest count");
    expect(text).toContain(
      "Beurre blanc · edition 2 · 1 1/2 quart (3 batches)",
    );
    expect(text).toContain("2 things to settle");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/kitchen/components/cmp-beurre");
  });

  it("says a set count stays when guests change", () => {
    expect(render(false)).toContain(
      "Set count — stays when the guest count changes",
    );
  });

  it("renders the menu line and the unresolved box as one kitchen reads them", () => {
    harness.review = {
      eventId: "ev-1",
      eventDishes: [
        {
          eventDishId: "ed-1",
          recipeNeeds: [
            {
              sourceKey: "rn-1",
              componentId: "cmp-beurre",
              componentName: "Beurre blanc",
              needQuantity: 1.5,
              needUnit: "quart",
              batchesExact: 3,
              editionVersion: 2,
            },
          ],
          unresolved: [
            {
              kind: "unit",
              eventDishId: "ed-1",
              refId: "a",
              label: "Honey",
              detail: "",
              text: "Honey: 2 cups can't be bought yet — Honey is sold by the pound and no cup weight is on file. Add one on Honey's units.",
            },
          ],
        },
      ],
      purchasing: { complete: false },
      unresolvedCount: 1,
    };
    act(() =>
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(EventUnresolvedMaterialsNotice, { eventId: "ev-1" }),
          createElement("h3", null, "Halibut — 30 servings · est. $148.20"),
          createElement(EventMenuLineKitchen, {
            eventId: "ev-1",
            eventDishId: "ed-1",
            followsEventHeadcount: true,
          }),
        ),
      ),
    );
    const text = container.innerText ?? container.textContent ?? "";
    expect(text).toContain("Unresolved materials");
    expect(text).toContain("edition 2");
    if (existsSync(".artifacts/llm-review"))
      writeFileSync(
        ".artifacts/llm-review/CF-9.5-artifact.html",
        container.innerHTML,
      );
  });

  it("does not ask for demand for a role that may not read it", () => {
    harness.role = "sales_staff";
    const text = render(true);
    expect(harness.enabled.every((value) => value === false)).toBe(true);
    expect(text).toContain("Follows the guest count");
    expect(text).not.toContain("Beurre blanc");
  });
});
