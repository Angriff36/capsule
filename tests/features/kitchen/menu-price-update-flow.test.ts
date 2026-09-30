// @vitest-environment jsdom
// AC-332 — the kitchen menu screen plans a dated price change and a season.
// Convex is mocked at the hook layer; that new quotes use the new price from
// its day while sent proposal revisions keep theirs is proven at runtime in
// tests/proofs/menu-effective-price.runtime.test.ts.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuPriceChangePlanner } from "../../../src/features/kitchen/MenuPriceChangePlanner";
import { MenuDetailsEditor } from "../../../src/features/kitchen/MenuDetailsEditor";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  schedule: vi.fn(async () => null),
  setSeason: vi.fn(async () => null),
}));

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useMenuDishSchedulePriceChange: () => harness.schedule,
  useMenuSetSeason: () => harness.setSeason,
  useMenuReviseDetails: () => vi.fn(async () => null),
  useMenuUpdatePricing: () => vi.fn(async () => null),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  harness.schedule.mockClear();
  harness.setSeason.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function setValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const proto =
    element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

const labelled = (text: string) => {
  const label = [...container.querySelectorAll("label")].find(
    (l) => l.querySelector("span")?.textContent === text,
  );
  return label!.querySelector("input, select") as
    HTMLInputElement | HTMLSelectElement;
};

describe("menu price update flow (AC-332)", () => {
  it("price update changes new quotes while an accepted proposal revision keeps its snapshotted price", async () => {
    const done = vi.fn();
    const future = Date.now() + 5 * 24 * 60 * 60 * 1000;
    await act(async () =>
      root.render(
        createElement(MenuPriceChangePlanner, {
          lines: [
            {
              _id: "md-1",
              version: 3,
              dishName: "Short rib",
              sellingPrice: 48,
              scheduledSellingPrice: 55,
              scheduledPriceEffectiveAt: future,
            },
          ],
          canEdit: true,
          onFailure: vi.fn(),
          onDone: done,
        }),
      ),
    );
    // The planned change is listed with both prices.
    expect(container.textContent).toContain("Short rib: $48.00 → $55.00 from");
    expect(container.textContent).toContain("Sent proposals keep their prices");

    await act(async () => {
      setValue(labelled("Dish"), "md-1");
      setValue(labelled("New price"), "60");
      setValue(labelled("Starting on"), "2026-12-01");
    });
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
    });
    expect(harness.schedule).toHaveBeenCalledWith({
      docId: "md-1",
      version: 3,
      sellingPrice: 60,
      effectiveAt: new Date("2026-12-01T00:00:00").getTime(),
    });
    expect(done).toHaveBeenCalledWith(
      "Short rib goes to $60.00 on 2026-12-01.",
    );
  });

  it("saves a season as whole days, and clears it when both dates are empty", async () => {
    await act(async () =>
      root.render(
        createElement(MenuDetailsEditor, {
          menu: {
            _id: "menu-1",
            version: 2,
            name: "Harvest",
            isTemplate: false,
            basePrice: 0,
            pricePerPerson: 40,
            minGuests: 0,
            maxGuests: 0,
            status: "published",
            availableFrom: null,
            availableUntil: null,
          },
          onFailure: vi.fn(),
        }),
      ),
    );
    const seasonForm = [...container.querySelectorAll("form")].find((f) =>
      f.textContent?.includes("Season"),
    )!;
    await act(async () => {
      setValue(labelled("Offered from"), "2026-09-01");
      setValue(labelled("Offered until"), "2026-11-30");
    });
    await act(async () => {
      seasonForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(harness.setSeason).toHaveBeenLastCalledWith({
      docId: "menu-1",
      version: 2,
      availableFrom: new Date("2026-09-01T00:00:00").getTime(),
      availableUntil: new Date("2026-11-30T23:59:59.999").getTime(),
    });

    await act(async () => {
      setValue(labelled("Offered from"), "");
      setValue(labelled("Offered until"), "");
    });
    await act(async () => {
      seasonForm.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(harness.setSeason).toHaveBeenLastCalledWith({
      docId: "menu-1",
      version: 2,
      availableFrom: undefined,
      availableUntil: undefined,
    });
  });
});
