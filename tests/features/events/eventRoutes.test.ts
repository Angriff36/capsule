import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  eventDetailPath,
  eventMenuRedirectPath,
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
