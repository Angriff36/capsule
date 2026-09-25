// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { EventDetailPage } from "../src/features/events/EventDetailPage";
import type { Id } from "../src/lib/api";

const eventId = "nn7ez3fz56ya246m6p17az2ad58crnwg" as Id<"events">;
const venueId = "venue-coords-only-001" as Id<"venues">;
const page = () =>
  createElement(
    Routes,
    null,
    createElement(Route, {
      path: "/events/:id",
      element: createElement(EventDetailPage),
    }),
  );

function seedEvent(overrides: Record<string, unknown> = {}) {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Campsite wedding",
    eventType: "wedding",
    stage: "executing",
    clientId: "client-a",
    venueId,
    startsAt: Date.UTC(2099, 5, 12, 22),
    endsAt: Date.UTC(2099, 5, 13, 2),
    expectedHeadcount: 30,
    budgetAmount: 0,
    quotedPrice: 0,
    version: 3,
    ...overrides,
  });
}

it("shows the venue map and event-day weather chip for a coordinates-only venue", async () => {
  seedEvent();
  backend.values.set("useListVenue", [
    {
      _id: venueId,
      name: "Singh Campsite",
      latitude: 47.01359,
      longitude: -116.52979,
      capacity: 60,
    },
  ]);
  // Deterministic Open-Meteo daily row covering the seeded event day.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        daily: {
          time: ["2099-06-12"],
          temperature_2m_max: [81],
          temperature_2m_min: [54],
          precipitation_probability_max: [10],
          wind_speed_10m_max: [8],
        },
      }),
    ),
  );
  try {
    await mount(page(), `/events/${eventId}`);
  } finally {
    vi.unstubAllGlobals();
  }

  const map = container.querySelector('[data-testid="event-map-panel"]');
  expect(map).not.toBeNull();
  const frame = map?.querySelector("iframe.event-map-frame");
  expect(frame).not.toBeNull();
  const src = frame?.getAttribute("src") ?? "";
  expect(src).toContain("openstreetmap.org/export/embed.html");
  expect(src).toContain("marker=47.01359");
  expect(src).toContain("-116.52979");
  expect(map?.textContent).toContain("Open in Google Maps");

  const chip = container.querySelector('[data-testid="event-weather-chip"]');
  expect(chip).not.toBeNull();
  expect(chip?.textContent).toContain("Jun 12");
  expect(chip?.textContent).toMatch(/° \/ \d+°/);
}, 20000);

it("renders without the old 7-day weather panel block", async () => {
  seedEvent();
  backend.values.set("useListVenue", [
    {
      _id: venueId,
      name: "Singh Campsite",
      latitude: 47.01359,
      longitude: -116.52979,
      capacity: 60,
    },
  ]);
  await mount(page(), `/events/${eventId}`);

  expect(
    container.querySelector('[data-testid="event-weather-panel"]'),
  ).toBeNull();
  expect(
    container.querySelector('[data-testid="event-recurring-summary"]'),
  ).toBeNull();
}, 20000);
