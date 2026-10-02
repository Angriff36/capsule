// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { backend, change, container, mount } from "../../support/mounted-app";
import {
  eventServiceStyleChoices,
  eventServiceStyleKey,
  eventServiceStyleLabel,
} from "../../../src/features/events/eventServiceStyle";
import { EventsListPage } from "../../../src/features/events/EventsListPage";

// The event list read hands back a NEW copy of the joined style record for
// every event, so grouping by that record made one group per event.
const full = (id: string) => ({
  _id: id,
  title: `Full ${id}`,
  stage: "planning",
  eventType: "dinner",
  startsAt: Date.now() + 86_400_000,
  serviceStyleId: "style-full",
  serviceStyleName: "Full Service",
  serviceStyle: { name: "Full Service" },
});

describe("event service style for lists and reports", () => {
  it("groups by the style id and names it from the style record", () => {
    const events = [
      full("e1"),
      full("e2"),
      {
        _id: "e3",
        title: "Drop e3",
        stage: "planning",
        serviceStyleId: "style-drop",
        serviceStyleName: "Drop Off",
        serviceStyle: null,
      },
      { _id: "e4", title: "Bare e4", stage: "planning" },
    ];
    expect(new Set(events.map(eventServiceStyleKey)).size).toBe(3);
    expect(eventServiceStyleLabel(events[2]!)).toBe("Drop Off");
    expect(eventServiceStyleLabel(events[3]!)).toBe("No service style");
    expect(eventServiceStyleChoices(events)).toEqual([
      { key: "style-drop", label: "Drop Off", count: 1 },
      { key: "style-full", label: "Full Service", count: 2 },
      { key: "none", label: "No service style", count: 1 },
    ]);
  });

  it("filters the events list by service style (AC-221, AC-222)", async () => {
    backend.values.set("useListEvent", [
      full("e1"),
      {
        ...full("e2"),
        title: "Vending e2",
        serviceStyleId: "style-vend",
        serviceStyleName: "Vending",
        serviceStyle: { name: "Vending" },
      },
    ]);
    await mount(createElement(EventsListPage));
    const select = container.querySelector<HTMLSelectElement>(
      'select[aria-label="Filter by service style"]',
    )!;
    expect([...select.options].map((option) => option.text)).toEqual([
      "Any style",
      "Full Service (1)",
      "Vending (1)",
    ]);
    expect(container.textContent).toContain("Full e1");
    expect(container.textContent).toContain("Vending e2");
    change(select, "style-vend");
    expect(container.textContent).not.toContain("Full e1");
    expect(container.textContent).toContain("Vending e2");
  });
});
