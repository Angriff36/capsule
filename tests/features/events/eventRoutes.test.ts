import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  eventDetailPath,
  eventMenuRedirectPath,
  eventsIndexPath,
  parseEventDetailTab,
} from "../../../src/features/events/eventRoutes";

describe("eventRoutes tab helpers", () => {
  it("defaults unknown tabs to overview", () => {
    expect(parseEventDetailTab(null)).toBe("overview");
    expect(parseEventDetailTab("not-a-tab")).toBe("overview");
    expect(parseEventDetailTab("overview")).toBe("overview");
    expect(parseEventDetailTab("staffing")).toBe("staffing");
  });

  it("builds event detail paths with tab query", () => {
    expect(eventDetailPath("evt1")).toBe("/events/evt1?tab=overview");
    expect(eventDetailPath("evt1", "margin")).toBe("/events/evt1?tab=margin");
  });

  it("redirects old event menu links to the menu tab", () => {
    expect(eventMenuRedirectPath("evt9")).toBe("/events/evt9?tab=menu");
  });
});

describe("event menu URL alias", () => {
  it("App.tsx redirects /events/:id/menu to the menu tab", () => {
    const app = readFileSync("src/app/App.tsx", "utf8");
    expect(app).toContain('path="/events/:id/menu"');
    expect(app).toContain("eventMenuRedirectPath");
    expect(app).toContain("RedirectEventMenuAlias");
  });
});

describe("events index path", () => {
  it("is the exact list route, never a record id", () => {
    expect(eventsIndexPath()).toBe("/events");
    expect(eventsIndexPath()).not.toMatch(/^\/events\/.+/);
  });

  it("App.tsx mounts the list at /events and does not redirect that path to a record", () => {
    const app = readFileSync("src/app/App.tsx", "utf8");
    expect(app).toContain('path="/events"');
    expect(app).toContain("EventsListPage");
    expect(app).toMatch(/path="\/events"[\s\S]{0,80}element=\{<EventsListPage/);
    expect(app).not.toMatch(
      /path="\/events"[\s\S]{0,160}Navigate to=\{?["'`]\/events\//,
    );
    expect(app).not.toContain("nn7ez3fz56ya246m6p17az2ad58crnwg");
  });
});
