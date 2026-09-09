// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { EventDetailPage } from "../src/features/events/EventDetailPage";
import { EventBattleBoardLayoutsPanel } from "../src/features/events/EventBattleBoardLayoutsPanel";
import type { Id } from "../src/lib/api";

const eventId = "nn7ez3fz56ya246m6p17az2ad58crnwg" as Id<"events">;
const page = () =>
  createElement(
    Routes,
    null,
    createElement(Route, {
      path: "/events/:id",
      element: createElement(EventDetailPage),
    }),
  );
it("shows the booked proposal and priced enhancements on the real event overview, respecting the returned proposal access", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    clientId: "client-a",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    budgetAmount: 1000,
    quotedPrice: 2000,
    version: 3,
  });
  const booking = {
    proposalId: "proposal-a",
    label: "Garden proposal",
    revisionLabel: "Revision 3",
    canOpenProposal: true,
    enhancements: [
      {
        _id: "extra-a",
        name: "Wine pairing",
        description: "Four wines",
        price: 180,
      },
    ],
  };
  backend.values.set("quoteBuilder:getEventBookingDetails", booking);
  await mount(page(), `/events/${eventId}`);
  expect(backend.reads).toHaveBeenCalledWith(
    "quoteBuilder:getEventBookingDetails",
    { eventId },
  );
  const source = container.querySelector(
    '[data-testid="event-proposal-source-card"]',
  )!;
  expect(source.textContent).toContain("Garden proposal");
  expect(source.textContent).toContain("Revision 3");
  expect(
    source.querySelector('a[href="/clients/proposals?proposal=proposal-a"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[data-testid="event-enhancements-card"]')
      ?.textContent,
  ).toContain("Wine pairing — Four wines · $180.00");
  backend.values.set("quoteBuilder:getEventBookingDetails", {
    ...booking,
    canOpenProposal: false,
    enhancements: [],
  });
  await mount(page());
  expect(source.textContent).toContain("Garden proposal");
  expect(source.querySelector("a")).toBeNull();
  expect(
    container.querySelector('[data-testid="event-enhancements-card"]'),
  ).toBeNull();
});

it("renders malformed imported layout fields safely while preserving real instructions and accessibility notes", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    venueId: "venue-a",
    expectedHeadcount: 40,
    accessibilityNeeds: ["  Ramp  ", "", "Wide aisles"],
  });
  backend.values.set("useGetVenue", {
    _id: "venue-a",
    accessNotes: 42,
    loadInInstructions: "  Use east door  ",
    logisticsNotes: { note: "bad" },
  });
  backend.values.set("useListEventLayoutSection", [
    {
      _id: "layout-a",
      eventId,
      type: 42,
      instructions: null,
      sortOrder: 0,
      addedAt: 1,
      version: 1,
    },
    {
      _id: "layout-b",
      eventId,
      type: "Bar",
      instructions: "  Ice at service  ",
      sortOrder: 1,
      addedAt: 1,
      version: 1,
    },
  ]);
  await mount(createElement(EventBattleBoardLayoutsPanel, { eventId }));
  expect(container.textContent).toContain("Ramp, Wide aisles");
  expect(container.textContent).toContain("Use east door");
  expect(
    [...container.querySelectorAll("textarea")].map((node) => node.value),
  ).toContain("  Ice at service  ");
  expect(container.textContent).not.toContain("[object Object]");
});
