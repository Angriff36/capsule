// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { EventStaffingTab } from "../src/features/events/EventStaffingTab";
import { EventTimelinePanel } from "../src/features/events/EventTimelinePanel";
import type { Id } from "../src/lib/api";
it("includes filled staff needs alongside assignments in the staffing tab and timeline assignee choices", async () => {
  const eventId = "event-a" as Id<"events">;
  backend.values.set("useListPerson", [
    {
      _id: "person-a",
      givenName: "Renee",
      familyName: "Kopf",
      status: "active",
    },
    {
      _id: "person-b",
      givenName: "Sam",
      familyName: "Server",
      status: "active",
    },
  ]);
  backend.values.set("useListEventStaffNeed", [
    {
      _id: "need-a",
      eventId,
      role: "Bartender",
      status: "filled",
      filledByPersonId: "person-a",
      startsAt: Date.UTC(2026, 8, 8, 16),
      version: 2,
    },
  ]);
  backend.values.set("useListEventAssignment", [
    {
      _id: "assignment-a",
      eventId,
      personId: "person-b",
      role: "Server",
      status: "assigned",
      version: 1,
    },
  ]);
  await mount(createElement(EventStaffingTab, { eventId }));
  const roster = container.querySelector(
    '[data-testid="event-staffing-roster"]',
  );
  expect(roster?.textContent).toContain("Renee Kopf");
  expect(roster?.textContent).toContain("Bartender");
  expect(roster?.textContent).toContain("Sam Server");
  backend.values.set("useListEventTimelineActivity", [
    {
      _id: "activity-a",
      eventId,
      name: "Service",
      scheduledAt: 1,
      startsAt: Date.UTC(2026, 8, 8, 17),
      version: 1,
    },
  ]);
  await mount(createElement(EventTimelinePanel, { eventId }));
  expect(
    container.querySelector('input[aria-label="Renee Kopf"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('input[aria-label="Sam Server"]'),
  ).not.toBeNull();
});
