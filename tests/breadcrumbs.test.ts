import { describe, expect, it } from "vitest";
import { breadcrumbsForPath } from "../src/app/shell/breadcrumbs";
import { eventsIndexPath } from "../src/features/events/eventRoutes";

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

describe("events index breadcrumb target", () => {
  it("keeps /events on the list, never a specific event detail", () => {
    const crumbs = breadcrumbsForPath("/events");
    expect(crumbs.map((crumb) => crumb.label)).toEqual(["Events"]);
    for (const crumb of crumbs) {
      if (!crumb.to) continue;
      expect(crumb.to).toBe(eventsIndexPath());
      expect(crumb.to).not.toMatch(/^\/events\/.+/);
      expect(crumb.to).not.toContain("nn7ez3fz56ya246m6p17az2ad58crnwg");
      expect(crumb.to).not.toContain("test-event-id");
    }
  });
});
