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
