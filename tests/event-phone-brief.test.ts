// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { EventDetailPage } from "../src/features/events/EventDetailPage";
import type { Id } from "../src/lib/api";

// AC-251 / AC-250: on a phone the event page opens with the things a lead
// checks first, in the spec's order, each row a touch-sized way into the work.
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

function phone(matches: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

function seed() {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    plannedAt: 1,
    clientId: "client-a",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    venueName: "Garden Hall",
    venueAddress: "100 Oak St",
    serviceStyleName: "Family style",
    primaryContactName: "Dana Reyes",
    primaryContactPhone: "555-0100",
    serviceRequirements: "Allergies: peanuts at table 4",
    accessibilityNeeds: ["Ramp at side door"],
    hasAssignedClient: true,
    hasMenuDishes: false,
    version: 3,
  });
  backend.values.set("useListProposal", [
    {
      _id: "proposal-old",
      eventId,
      status: "draft",
      createdAt: 5,
      updatedAt: 9,
      deletedAt: null,
    },
    {
      _id: "proposal-a",
      eventId,
      status: "accepted",
      createdAt: 2,
      updatedAt: 3,
      deletedAt: null,
    },
  ]);
  backend.values.set("useListPrepTask", [
    { _id: "t1", eventId, status: "completed", deletedAt: null },
    { _id: "t2", eventId, status: "pending", deletedAt: null },
    { _id: "t3", eventId, status: "cancelled", deletedAt: null },
    { _id: "t4", eventId: "other", status: "pending", deletedAt: null },
  ]);
  backend.values.set("useListPackList", [
    { _id: "pack-a", eventId, status: "packing", deletedAt: null },
  ]);
}

it("opens a phone event page with next step, when/where, contact, style, proposal, staffing, prep, pack list and critical notes in that order", async () => {
  phone(true);
  seed();
  await mount(page(), `/events/${eventId}`);

  const brief = container.querySelector('[aria-label="Event at a glance"]');
  expect(brief).not.toBeNull();
  const order = [...brief!.querySelectorAll("li")].map((row) =>
    row.getAttribute("data-testid"),
  );
  expect(order).toEqual([
    "event-brief-next",
    "event-brief-when",
    "event-brief-contact",
    "event-brief-service",
    "event-brief-proposal",
    "event-brief-staffing",
    "event-brief-prep",
    "event-brief-pack",
    "event-brief-notes",
  ]);
  const row = (id: string) =>
    brief!.querySelector(`[data-testid="event-brief-${id}"]`)!;

  // The brief comes before the desktop tiles.
  const tiles = container.querySelector(".evd-tiles")!;
  expect(
    brief!.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

  expect(row("when").textContent).toContain("Garden Hall, 100 Oak St");
  expect(row("when").querySelector("a")?.getAttribute("href")).toContain(
    encodeURIComponent("Garden Hall, 100 Oak St"),
  );
  expect(row("contact").textContent).toContain("Dana Reyes");
  expect(row("contact").querySelector('a[href="tel:555-0100"]')).not.toBeNull();
  expect(row("service").textContent).toContain("Family style");
  // Accepted beats a newer draft.
  expect(row("proposal").textContent).toContain("Accepted");
  expect(
    row("proposal").querySelector(
      'a[href="/clients/proposals?proposal=proposal-a"]',
    ),
  ).not.toBeNull();
  expect(row("staffing").textContent).toContain("Nobody assigned yet");
  expect(row("prep").textContent).toContain("1 of 2 prep tasks done");
  expect(row("pack").textContent).toContain("Packing");
  expect(
    row("pack").querySelector('a[href="/logistics/packs/pack-a"]'),
  ).not.toBeNull();
  expect(row("notes").textContent).toContain("Allergy: peanuts at table 4");
  expect(row("notes").textContent).toContain("Access: Ramp at side door");

  // Every row's control is a real button or link with a name (no hover-only).
  for (const control of brief!.querySelectorAll("a, button")) {
    expect(control.textContent?.trim()).not.toBe("");
  }
});

it("keeps the desktop overview without the phone summary", async () => {
  phone(false);
  seed();
  await mount(page(), `/events/${eventId}`);
  expect(
    container.querySelector('[data-testid="event-overview-tab"]'),
  ).not.toBeNull();
  expect(
    container.querySelector('[aria-label="Event at a glance"]'),
  ).toBeNull();
});
