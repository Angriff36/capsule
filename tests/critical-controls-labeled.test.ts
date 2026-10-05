// @vitest-environment jsdom
import { createElement } from "react";
import { Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { backend, container, mount } from "./support/mounted-app";
import { unnamedControls } from "./support/accessible-names";
import { EventDetailPage } from "../src/features/events/EventDetailPage";
import { PackListDetailPage } from "../src/features/logistics/PackListDetailPage";
import type { Id } from "../src/lib/api";

// AC-171: on the critical field screens at phone width every button, link
// and field has a name a screen reader can say.
const eventId = "nn7ez3fz56ya246m6p17az2ad58crnwg" as Id<"events">;
const LIST = "kd7cf1t17pmj822wqhm65j6sb18f9et8";

function phone() {
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: media.includes("max-width"),
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

const route = (path: string, element: Parameters<typeof createElement>[0]) =>
  createElement(
    Routes,
    null,
    createElement(Route, { path, element: createElement(element) }),
  );

it("the phone event page has a name for every control", async () => {
  phone();
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
    primaryContactName: "Dana Reyes",
    primaryContactPhone: "555-0100",
    serviceRequirements: "Allergies: peanuts",
    version: 3,
  });
  await mount(route("/events/:id", EventDetailPage), `/events/${eventId}`);
  expect(
    container.querySelector('[aria-label="Event at a glance"]'),
  ).not.toBeNull();
  expect(unnamedControls(document.body)).toEqual([]);
});

it("the phone pack list has a name for every control", async () => {
  phone();
  backend.values.set("useGetPackList", {
    _id: LIST,
    eventId: "event-a",
    status: "packing",
    version: 1,
    name: "Smith wedding pack",
  });
  backend.values.set("useListPackListItem", [
    {
      _id: "item-cutter",
      packListId: LIST,
      description: "Cake cutter",
      requiredQuantity: 2,
      packedQuantity: 1,
      unit: "each",
      status: "listed",
      version: 1,
    },
  ]);
  await mount(
    route("/logistics/packs/:id", PackListDetailPage),
    `/logistics/packs/${LIST}`,
  );
  expect(container.textContent).toContain("Cake cutter");
  expect(unnamedControls(document.body)).toEqual([]);
});

it.each(["prep", "staffing", "equipment"])(
  "the phone event %s tab has a name for every control",
  async (tab) => {
    phone();
    backend.values.set("useGetEvent", {
      _id: eventId,
      title: "Garden dinner",
      eventType: "dinner",
      stage: "planning",
      plannedAt: 1,
      startsAt: Date.UTC(2099, 6, 4, 17),
      endsAt: Date.UTC(2099, 6, 4, 22),
      expectedHeadcount: 40,
      version: 3,
    });
    await mount(
      route("/events/:id", EventDetailPage),
      `/events/${eventId}?tab=${tab}`,
    );
    expect(unnamedControls(document.body)).toEqual([]);
  },
);

it("the scan reports an icon-only button and a bare field", () => {
  const box = document.createElement("div");
  box.innerHTML =
    '<button type="button"><svg></svg></button><button aria-label="Close"><svg></svg></button><label>Qty <input></label><input id="x">';
  expect(unnamedControls(box)).toHaveLength(2);
});
