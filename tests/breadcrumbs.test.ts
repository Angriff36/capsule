import { describe, expect, it } from "vitest";
import { breadcrumbsForPath } from "../src/app/shell/breadcrumbs";

function labels(pathname: string): string[] {
  return breadcrumbsForPath(pathname).map((crumb) => crumb.label);
}

describe("breadcrumbsForPath", () => {
  it("uses the Purchasing guide title on a received PO folio, never Detail", () => {
    const trail = labels("/inventory/orders/wd7c3bv09fwcynzbgtjj2qavyx8bjpd6");
    expect(trail).not.toContain("Detail");
    expect(trail.at(-1)).toBe("Purchasing");
    expect(trail).toEqual(["Inventory", "Purchasing"]);
  });

  it("uses the Event guide title on an event record, never Detail", () => {
    const trail = labels("/events/test-event-id");
    expect(trail).not.toContain("Detail");
    expect(trail.at(-1)).toBe("Event");
    expect(trail).toEqual(["Events", "Event"]);
  });

  it("keeps area roots as a single crumb", () => {
    expect(labels("/kitchen")).toEqual(["Kitchen"]);
    expect(labels("/events")).toEqual(["Events"]);
    expect(labels("/inventory")).toEqual(["Inventory"]);
  });

  it("lets sub-tabs read as themselves without a Detail suffix", () => {
    expect(labels("/inventory/purchasing")).toEqual([
      "Inventory",
      "Purchasing",
    ]);
    expect(labels("/kitchen/dishes")).toEqual(["Kitchen", "Dishes"]);
    expect(labels("/kitchen/dishes/abc")).toEqual(["Kitchen", "Dishes"]);
    expect(labels("/events/new")).toEqual(["Events", "New event"]);
  });
});
