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

it("prints the booked venue snapshot in the header, not a later catalog rename", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    clientId: "client-a",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
    venueId: "venue-a",
    venueName: "Garden Hall",
    venueAddress: "100 Oak St",
  });
  backend.values.set("useListVenue", [
    {
      _id: "venue-a",
      name: "Garden Hall RENAMED",
      status: "active",
      registeredAt: 1,
      deletedAt: null,
    },
  ]);
  await mount(page(), `/events/${eventId}`);
  expect(container.textContent).toContain("Garden Hall");
  expect(container.textContent).toContain("100 Oak St");
  // Scoped to the header venue chip: the edit-basics form's venue picker
  // legitimately lists live catalog names, so the whole page still contains
  // the renamed string.
  const headerVenue = container.querySelector('a[href="/facilities"]');
  expect(headerVenue?.textContent).toBe("Garden Hall");
});

it("prints the booked service style snapshot in the details card, not a later catalog rename", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
    serviceStyleId: "style-a",
    serviceStyleName: "Full Service",
  });
  backend.values.set("useListServiceStyle", [
    {
      _id: "style-a",
      name: "Full Service RENAMED",
      status: "active",
      deletedAt: null,
    },
  ]);
  await mount(page(), `/events/${eventId}`);
  // Scoped to the details card: the edit-basics form's style picker
  // legitimately lists live catalog names, so the whole page still contains
  // the renamed string.
  const card = container.querySelector('[data-testid="event-details-card"]')!;
  expect(card.textContent).toContain("Full Service");
  expect(card.textContent).not.toContain("Full Service RENAMED");
});

it("prints the booked occasion snapshot in the details card, not a later catalog rename", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
    occasionId: "occ-a",
    occasionName: "Wedding",
  });
  backend.values.set("useListOccasion", [
    {
      _id: "occ-a",
      name: "Wedding RENAMED",
      status: "active",
      deletedAt: null,
    },
  ]);
  await mount(page(), `/events/${eventId}`);
  // Scoped to the details card: the edit-basics form's occasion picker
  // legitimately lists live catalog names, so the whole page still contains
  // the renamed string.
  const card = container.querySelector('[data-testid="event-details-card"]')!;
  expect(card.textContent).toContain("Wedding");
  expect(card.textContent).not.toContain("Wedding RENAMED");
});

it("prints the booked client snapshot in the details card, not a later catalog rename", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    clientId: "client-a",
    clientName: "Acme Catering",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
  });
  backend.values.set("useListClient", [
    {
      _id: "client-a",
      clientType: "company",
      companyName: "Acme RENAMED",
      status: "active",
      deletedAt: null,
    },
  ]);
  await mount(page(), `/events/${eventId}`);
  // Scoped to the details card: the edit-basics form's client picker
  // legitimately lists live catalog names, so the whole page still contains
  // the renamed string.
  const card = container.querySelector('[data-testid="event-details-card"]')!;
  expect(card.textContent).toContain("Acme Catering");
  expect(card.textContent).not.toContain("Acme RENAMED");
});

it("prints the booked owner snapshot in the assigned-owner card, not a later catalog rename", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
    assignedToId: "person-a",
    ownerName: "Pat Owner",
  });
  backend.values.set("useListPerson", [
    {
      _id: "person-a",
      givenName: "Pat",
      familyName: "Owner RENAMED",
      role: "sales_manager",
    },
  ]);
  await mount(page(), `/events/${eventId}`);
  const name = container.querySelector(
    '[data-testid="event-assigned-owner-name"]',
  );
  expect(name?.textContent).toBe("Pat Owner");
  const card = container.querySelector('[data-testid="event-assigned-owner"]')!;
  expect(card.textContent).not.toContain("RENAMED");
});

it("prints the booked source-evidence key on the import draft, not a later live file name", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    version: 3,
    importSourceKey: "beo-worksheet-v1",
    importDraftJson: JSON.stringify({
      version: 1,
      sourceKey: "beo-worksheet-v1",
      sources: [{ storageId: "storage-proof", name: "worksheet-RENAMED.pdf" }],
      facts: {},
      menu: [],
      missing: [],
      issues: [],
      status: "saved",
    }),
  });
  await mount(page(), `/events/${eventId}`);
  const link = container.querySelector(
    '[data-testid="event-source-evidence-key"]',
  );
  expect(link?.textContent).toBe("Source link: beo-worksheet-v1");
  // The Source files list may still show the later file name — that is the
  // file, not the stored link.
  expect(container.textContent).toContain("worksheet-RENAMED.pdf");
});

it("prints the booked commercial seed on the budget card, not a later proposal total", async () => {
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
  // A later-looking total on the booking details must not reach the seed.
  backend.values.set("quoteBuilder:getEventBookingDetails", {
    proposalId: "proposal-a",
    label: "Garden proposal",
    revisionLabel: "Revision 3",
    canOpenProposal: true,
    total: 9999,
    enhancements: [],
  });
  await mount(page(), `/events/${eventId}`);
  const card = container.querySelector('[data-testid="event-budget-card"]')!;
  // formatMoney prints whole-dollar USD without cents.
  expect(card.textContent).toContain("$2,000");
  expect(card.textContent).toContain("$1,000");
  expect(card.textContent).not.toContain("$9,999");
});

it("prints the live nine-domain readiness summary, not a frozen Event readiness name", async () => {
  backend.values.set("useGetEvent", {
    _id: eventId,
    title: "Garden dinner",
    eventType: "dinner",
    stage: "planning",
    clientId: "client-a",
    startsAt: Date.UTC(2099, 6, 4, 17),
    endsAt: Date.UTC(2099, 6, 4, 22),
    expectedHeadcount: 40,
    quotedPrice: 2000,
    version: 3,
    // deliberately no readiness / readinessName field
  });
  backend.values.set("eventReadiness:getEventReadiness", {
    eventId,
    domains: [
      {
        domain: "commercial",
        issues: [
          {
            code: "commercial.quoted_price_missing",
            affectedIds: [eventId],
            severity: "warning",
            reason: "This event has no quoted price to seed billing.",
            resolvingAction: "Event.changePricing",
          },
        ],
      },
      { domain: "planning", issues: [] },
      { domain: "kitchen", issues: [] },
      { domain: "purchasing", issues: [] },
      { domain: "staffing", issues: [] },
      { domain: "packing", issues: [] },
      { domain: "packet", issues: [] },
      { domain: "execution", issues: [] },
      { domain: "closeout", issues: [] },
    ],
  });
  await mount(page(), `/events/${eventId}`);
  expect(backend.reads).toHaveBeenCalledWith(
    "eventReadiness:getEventReadiness",
    { eventId },
  );
  const card = container.querySelector(
    '[data-testid="event-readiness-summary"]',
  )!;
  for (const label of [
    "Commercial",
    "Planning",
    "Kitchen",
    "Purchasing",
    "Staffing",
    "Packing",
    "Packet",
    "Execution",
    "Closeout",
  ]) {
    expect(card.textContent).toContain(label);
  }
  expect(card.textContent).toContain(
    "This event has no quoted price to seed billing.",
  );
  expect(card.textContent).toContain("warning");
  expect(card.textContent).toContain("Event.changePricing");
  expect(card.textContent).toContain("1 open");
  expect(card.textContent).not.toContain("FROZEN READY");
  expect(card.textContent).not.toContain("readinessName");
  expect(
    container.querySelector(
      '[data-testid="event-readiness-domain-commercial"]',
    ),
  ).not.toBeNull();
  expect(
    container.querySelector('[data-testid="event-readiness-domain-closeout"]'),
  ).not.toBeNull();

  // LIVE, not a stored Event name: only the query value changes, and the card
  // prints the new facts on the next mount.
  backend.values.set("eventReadiness:getEventReadiness", {
    eventId,
    domains: [
      { domain: "commercial", issues: [] },
      { domain: "planning", issues: [] },
      { domain: "kitchen", issues: [] },
      { domain: "purchasing", issues: [] },
      { domain: "staffing", issues: [] },
      { domain: "packing", issues: [] },
      { domain: "packet", issues: [] },
      { domain: "execution", issues: [] },
      { domain: "closeout", issues: [] },
    ],
  });
  await mount(page());
  const live = container.querySelector(
    '[data-testid="event-readiness-summary"]',
  )!;
  expect(live.textContent).not.toContain(
    "This event has no quoted price to seed billing.",
  );
  for (const label of [
    "Commercial",
    "Planning",
    "Kitchen",
    "Purchasing",
    "Staffing",
    "Packing",
    "Packet",
    "Execution",
    "Closeout",
  ]) {
    expect(live.textContent).toContain(label);
  }
  expect(live.textContent).toContain("0 open");
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
