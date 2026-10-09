// @vitest-environment jsdom
// PL-DASHBOARDS: sales tag a deal's add-on potential on the event Overview
// (owner's Avg Event Value Growth Strategy, "Pipeline Tagging").
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setPotential = vi.fn();
vi.mock("../../src/lib/manifest-convex-react", () => ({
  useEventSetUpsellPotential: () => setPotential,
}));

import { EventUpsellPotentialCard } from "../../src/features/events/EventUpsellPotentialCard";

describe("add-on potential card", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    setPotential.mockReset();
    setPotential.mockResolvedValue({});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (stage: string, potential: string | null) =>
    act(() => {
      root.render(
        createElement(EventUpsellPotentialCard, {
          eventId: "e1" as never,
          stage,
          potential: potential as never,
        }),
      );
    });
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find(
      (b) => b.textContent === name,
    )!;

  it("tags a quote and shows what to do", async () => {
    render("quote", null);
    expect(container.textContent).toContain("How much could this event grow");
    await act(async () => {
      button("High").click();
    });
    expect(setPotential).toHaveBeenCalledWith({
      docId: "e1",
      potential: "high",
    });
  });

  it("shows the picked tag and clears it", async () => {
    render("approved", "moderate");
    expect(container.textContent).toContain(
      "Moderate: usually +$500 to $1,500",
    );
    expect(button("Moderate").getAttribute("aria-checked")).toBe("true");
    await act(async () => {
      button("Clear").click();
    });
    expect(setPotential).toHaveBeenCalledWith({
      docId: "e1",
      potential: undefined,
    });
  });

  it("is not shown once the event is finished or cancelled", () => {
    render("completed", "high");
    expect(
      container.querySelector("[data-testid='event-upsell-potential']"),
    ).toBeNull();
    render("cancelled", null);
    expect(
      container.querySelector("[data-testid='event-upsell-potential']"),
    ).toBeNull();
  });
});
