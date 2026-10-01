// @vitest-environment jsdom
/**
 * Issue #151 polish cluster: behaviour proof for the fixes that had none
 * (AC-047 burndown). Each case fails if its papercut comes back.
 */
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import {
  button,
  click,
  command,
  backend,
  container,
  mount,
} from "../support/mounted-app";
import { guestTableLabel } from "../../src/features/events/guestTableLabel";
import { formatCountNoun } from "../../src/lib/format";
import { MyDayFrame } from "../../src/features/staff/MyDayFrame";
import { DishComponentsPanel } from "../../src/features/kitchen/DishComponentsPanel";

describe("#151 words", () => {
  it("a guest table never reads 'Table Table 3'", () => {
    expect(guestTableLabel("3")).toBe("Table 3");
    expect(guestTableLabel("Table 3")).toBe("Table 3");
    expect(guestTableLabel("table 12")).toBe("table 12");
    expect(guestTableLabel("Head table")).toBe("Head table");
  });

  it("counts read '1 record', '2 records'", () => {
    expect(formatCountNoun(1, "record")).toBe("1 record");
    expect(formatCountNoun(2, "record")).toBe("2 records");
    expect(formatCountNoun(0, "item")).toBe("0 items");
    expect(formatCountNoun(1, "person", "people")).toBe("1 person");
    expect(formatCountNoun(3, "person", "people")).toBe("3 people");
  });
});

describe("#151 layout", () => {
  it("My Day widens on a desktop screen instead of a phone column", () => {
    const html = (wide: boolean) =>
      renderToStaticMarkup(
        createElement(
          MemoryRouter,
          null,
          createElement(MyDayFrame, { wide, signedInName: "Ada Cook" }, null),
        ),
      );
    expect(html(true)).toContain("md:max-w-5xl");
    expect(html(false)).not.toContain("md:max-w-5xl");
  });
});

describe("#151 removing a subrecipe asks first", () => {
  it("Remove on a dish's subrecipe confirms before anything changes", async () => {
    vi.useFakeTimers();
    backend.values.set("useListDishComponent", [
      {
        _id: "dc-1",
        dishId: "dish-1",
        componentId: "comp-1",
        yieldQuantity: 1,
        batchMultiplier: 1,
        version: 4,
      },
    ]);
    backend.values.set("useListComponent", [
      { _id: "comp-1", name: "Red wine jus", yieldUnit: "quart" },
    ]);
    const detach = command("useDishComponentDetach", { version: 5 });
    await mount(createElement(DishComponentsPanel, { dishId: "dish-1" }));

    await click(button("Remove"));
    expect(detach).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      'Remove "Red wine jus" from this dish?',
    );

    // A danger confirm arms after a short pause so a double tap can't fire it.
    const prompt = container.querySelector<HTMLFormElement>(
      "[data-action-prompt]",
    )!;
    await act(async () => vi.advanceTimersByTime(1000));
    await click(button("Remove", prompt));
    expect(detach).toHaveBeenCalledWith({
      docId: "dc-1",
      version: 4,
      reason: "Removed from dish",
    });
    expect(container.textContent).toContain("Subrecipe removed.");
    vi.useRealTimers();
  });
});
