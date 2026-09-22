// @vitest-environment jsdom
import { act, createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  field,
  button,
  click,
  change,
  submit,
  location,
} from "./support/mounted-app";
import { EventCreatePage } from "../src/features/events/EventCreatePage";

function selectWith(label: string) {
  const select = [...container.querySelectorAll("select")].find((node) =>
    [...node.options].some((option) => option.text === label),
  );
  expect(select, label).toBeDefined();
  return select!;
}
function bookingOptions() {
  backend.values.set("useListClient", [
    {
      _id: "client-a",
      companyName: "Client A",
      clientType: "company",
      status: "active",
      registeredAt: 1,
    },
  ]);
  backend.values.set("useListVenue", [
    {
      _id: "venue-a",
      name: "Garden",
      status: "active",
      registeredAt: 1,
      capacity: 200,
    },
  ]);
}
async function chooseAccountOrVenue(name: string, label: string) {
  const control =
    field(name).parentElement!.querySelector<HTMLInputElement>(
      '[role="combobox"]',
    )!;
  change(control, label);
  await act(async () => {
    control.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}
it("explains a missing client, then enforces the required contact before sending the event", async () => {
  bookingOptions();
  const create = command("useCreateEvent");
  await mount(createElement(EventCreatePage));
  const save = button("Create event");
  expect(save.disabled).toBe(true);
  expect(container.textContent).toContain("Client is required");
  await chooseAccountOrVenue("clientId", "Client A");
  await chooseAccountOrVenue("venueId", "Garden");
  input("title", "Summer dinner");
  input("eventType", "dinner");
  input("expectedHeadcount", "40");
  input("startsAt", "2099-07-04T17:30");
  input("endsAt", "2099-07-04T22:00");
  input("budgetAmount", "1000");
  input("quotedPrice", "2000");
  expect(field("primaryContactName").closest("label")?.textContent).toContain(
    "Name *",
  );
  expect(field("primaryContactName").validity.valueMissing).toBe(true);
  await click(save);
  expect(create).not.toHaveBeenCalled();
  input("primaryContactName", "Ada Cook");
  await click(save);
  expect(create).toHaveBeenCalledTimes(1);
  expect(create.mock.calls[0][0]).toMatchObject({
    clientId: "client-a",
    venueId: "venue-a",
    title: "Summer dinner",
    primaryContactName: "Ada Cook",
    expectedHeadcount: 40,
  });
});

it("renders empty catalog recovery links and updates the selectors when live catalog rows change", async () => {
  await mount(createElement(EventCreatePage));
  expect(container.textContent).toContain("No occasions yet");
  expect(button("Add the standard list").disabled).toBe(false);
  expect(container.querySelectorAll('a[href="/admin/catalogs"]')).toHaveLength(
    1,
  );
  expect(selectWith("Full Service").required).toBe(false);
  expect(selectWith("Select an occasion").required).toBe(false);
  backend.values.set("useListServiceStyle", [
    { _id: "style-a", name: "Chef's table", status: "active" },
    { _id: "old", name: "Retired style", status: "inactive" },
  ]);
  backend.values.set("useListOccasion", [
    { _id: "occasion-a", name: "Anniversary", status: "active" },
  ]);
  await mount(createElement(EventCreatePage));
  expect(
    [...selectWith("Chef's table").options].map((option) => option.text),
  ).toEqual(["Select a service style", "Chef's table"]);
  expect(selectWith("Anniversary")).toBeDefined();
  expect(container.textContent).not.toContain("No occasions yet");
  expect(container.textContent).not.toContain("Add the standard list");
});

const SEAM_COMMAND =
  "lib/proposalEventCreation:createEventFromAcceptedProposal";

// Route with the client preselected in the URL: used by the proposal states
// that cannot auto-fill the account from a proposal row (loading, missing,
// tombstoned).
const CLIENT_ROUTE = "/events/new?proposalId=proposal-a&clientId=client-a";

function acceptedProposal(overrides: Record<string, unknown> = {}) {
  return {
    _id: "proposal-a",
    title: "Anniversary dinner",
    clientId: "client-a",
    venueName: "Garden",
    status: "accepted",
    version: 3,
    eventDate: new Date("2099-07-04T17:30").getTime(),
    eventEndDate: new Date("2099-07-04T22:00").getTime(),
    guestCount: 40,
    total: 2000,
    ...overrides,
  };
}

async function fillEventForm() {
  input("title", "Summer dinner");
  input("eventType", "dinner");
  input("expectedHeadcount", "40");
  input("startsAt", "2099-07-04T17:30");
  input("endsAt", "2099-07-04T22:00");
  input("budgetAmount", "1000");
  input("quotedPrice", "2000");
  input("primaryContactName", "Ada Cook");
}

async function mountProposalRoute(
  proposal: unknown,
  route = "/events/new?proposalId=proposal-a",
) {
  bookingOptions();
  backend.values.set("useGetProposal", proposal);
  await mount(createElement(EventCreatePage), route);
}

// AC-411: a refusal only proves the guard when the submitted form is genuinely
// valid. Fill every text field, guarantee the client/venue choice, and refuse
// to dispatch submit until FormData carries both ids and the form checks valid.
async function fillValidProposalForm(route: string) {
  await fillEventForm();
  if (!route.includes("clientId="))
    await chooseAccountOrVenue("clientId", "Client A");
  await chooseAccountOrVenue("venueId", "Garden");
  const form = container.querySelector<HTMLFormElement>("#event-create-form");
  expect(form).not.toBeNull();
  const data = new FormData(form!);
  expect(data.get("clientId")).toBe("client-a");
  expect(data.get("venueId")).toBe("venue-a");
  expect(form!.checkValidity()).toBe(true);
  return form!;
}

// The dead CTA must be gone, not merely disabled — a disabled button proves
// nothing about the submit handler behind it, so negative cases dispatch the
// submit event directly.
function expectNoCreateButton() {
  expect(
    [...container.querySelectorAll("button")].map((node) =>
      node.textContent?.trim(),
    ),
  ).not.toContain("Create event");
}

it("books an accepted unlinked proposal through the canonical seam and navigates to the returned event", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-booked" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(acceptedProposal());
  await fillValidProposalForm("/events/new?proposalId=proposal-a");
  await click(button("Create event"));
  expect(book).toHaveBeenCalledTimes(1);
  expect(book.mock.calls[0][0]).toMatchObject({
    proposalId: "proposal-a",
    proposalVersion: 3,
    event: {
      clientId: "client-a",
      venueId: "venue-a",
      venueName: "Garden",
      title: "Summer dinner",
      eventType: "dinner",
      startsAt: new Date("2099-07-04T17:30").getTime(),
      endsAt: new Date("2099-07-04T22:00").getTime(),
      expectedHeadcount: 40,
      primaryContactName: "Ada Cook",
      budgetAmount: 1000,
      quotedPrice: 2000,
    },
  });
  expect(generic).not.toHaveBeenCalled();
  // Navigation follows whatever docId the canonical response returns — the
  // page does not decide the destination itself. Backend runtime tests prove
  // the real replay when another operator booked first; this mock only pins
  // the page contract.
  expect(location).toBe("/events/event-booked?tab=overview");
});

it("keeps the venue reconciliation hint for an accepted unlinked proposal and books the venue the operator picks", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-booked" });
  await mountProposalRoute(acceptedProposal({ venueName: "Unmatched Hall" }));
  expect(container.textContent).toContain(
    "No saved venue matched “Unmatched Hall”",
  );
  expect(container.textContent).toContain("in the Venue panel");
  // The hint stays actionable: the real saved venue remains selectable and
  // the booking carries the operator's choice.
  await fillValidProposalForm("/events/new?proposalId=proposal-a");
  expect(field("venueId").value).toBe("venue-a");
  await click(button("Create event"));
  expect(book).toHaveBeenCalledTimes(1);
  expect(book.mock.calls[0][0].event).toMatchObject({
    venueId: "venue-a",
    venueName: "Garden",
  });
});

it("navigates from the one primary Open event link for an already-linked proposal", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-other" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(
    acceptedProposal({ eventId: "event-7", venueName: "Unmatched Hall" }),
  );
  expect(container.textContent).not.toContain("will not copy its menu");
  // An already-linked proposal must not invite venue reconciliation — the
  // create-form Venue panel cannot attach a venue to the saved Event.
  expect(container.textContent).not.toContain("in the Venue panel");
  expectNoCreateButton();
  const openEvent = container.querySelector<HTMLAnchorElement>(
    'a[href="/events/event-7?tab=overview"]',
  );
  expect(openEvent?.textContent).toContain("Open event");
  expect(openEvent?.className).toContain("btn-primary");
  expect(field("primaryContactName").value).toBe("");
  // A real click navigates — an unclicked href proves nothing.
  await click(openEvent!);
  expect(location).toBe("/events/event-7?tab=overview");
  expect(book).not.toHaveBeenCalled();
  expect(generic).not.toHaveBeenCalled();
});

it("cannot create through the handler for an already-linked proposal, even valid and directly submitted", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-other" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(acceptedProposal({ eventId: "event-7" }));
  expect(container.textContent).not.toContain("will not copy its menu");
  expectNoCreateButton();
  // Even a valid, directly-submitted form cannot write another event: the
  // handler — not a removed button — is the boundary.
  const form = await fillValidProposalForm("/events/new?proposalId=proposal-a");
  await submit(form);
  expect(book).not.toHaveBeenCalled();
  expect(generic).not.toHaveBeenCalled();
  expect(location).toBe("/events/event-7?tab=overview");
});

it("navigates from the same primary Open event link for a draft event-first proposal", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-other" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(
    acceptedProposal({
      status: "draft",
      eventId: "event-7",
      venueName: "Unmatched Hall",
    }),
  );
  expect(container.textContent).not.toContain("in the Venue panel");
  expectNoCreateButton();
  const openEvent = container.querySelector<HTMLAnchorElement>(
    'a[href="/events/event-7?tab=overview"]',
  );
  expect(openEvent?.className).toContain("btn-primary");
  expect(field("primaryContactName").value).toBe("");
  await click(openEvent!);
  expect(location).toBe("/events/event-7?tab=overview");
  expect(book).not.toHaveBeenCalled();
  expect(generic).not.toHaveBeenCalled();
});

it("cannot create through the handler for a draft event-first proposal, even valid and directly submitted", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-other" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(
    acceptedProposal({ status: "draft", eventId: "event-7" }),
  );
  expectNoCreateButton();
  const form = await fillValidProposalForm("/events/new?proposalId=proposal-a");
  await submit(form);
  expect(book).not.toHaveBeenCalled();
  expect(generic).not.toHaveBeenCalled();
  expect(location).toBe("/events/event-7?tab=overview");
});

it("cannot create while the proposal context is still loading, even on a valid submitted form", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-booked" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(undefined, CLIENT_ROUTE);
  expect(container.textContent).toContain("Loading proposal");
  expectNoCreateButton();
  const form = await fillValidProposalForm(CLIENT_ROUTE);
  await submit(form);
  expect(generic).not.toHaveBeenCalled();
  expect(book).not.toHaveBeenCalled();
  expect(location).toBe(CLIENT_ROUTE);
});

it("gives a missing proposal a standalone exit and no creation path", async () => {
  // Deleted proposals filter out of the generated read exactly like missing
  // ones, so null covers both.
  const book = command(SEAM_COMMAND, { docId: "event-booked" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(null, CLIENT_ROUTE);
  expect(container.textContent).toContain("This proposal no longer exists.");
  expect(
    container.querySelector<HTMLAnchorElement>('a[href="/events/new"]'),
  ).not.toBeNull();
  expectNoCreateButton();
  const form = await fillValidProposalForm(CLIENT_ROUTE);
  await submit(form);
  expect(generic).not.toHaveBeenCalled();
  expect(book).not.toHaveBeenCalled();
  expect(location).toBe(CLIENT_ROUTE);
});

it("treats a stale soft-deleted proposal like a missing one — no event exit and no creation path", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-booked" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(
    acceptedProposal({ deletedAt: 12345 }),
    CLIENT_ROUTE,
  );
  expect(container.textContent).toContain("This proposal no longer exists.");
  expect(
    container.querySelector<HTMLAnchorElement>('a[href="/events/new"]'),
  ).not.toBeNull();
  expect(container.textContent).not.toContain("Open event");
  expectNoCreateButton();
  const form = await fillValidProposalForm(CLIENT_ROUTE);
  await submit(form);
  expect(generic).not.toHaveBeenCalled();
  expect(book).not.toHaveBeenCalled();
  expect(location).toBe(CLIENT_ROUTE);
});

it("cannot create for a nonaccepted unlinked proposal, even valid and directly submitted", async () => {
  const book = command(SEAM_COMMAND, { docId: "event-booked" });
  const generic = command("useCreateEvent");
  await mountProposalRoute(acceptedProposal({ status: "draft" }), CLIENT_ROUTE);
  expect(container.textContent).toContain("This proposal is draft");
  expect(container.textContent).not.toContain(
    "the event will be created without linking it",
  );
  expect(
    container.querySelector<HTMLAnchorElement>(
      'a[href="/clients/proposals?proposal=proposal-a"]',
    ),
  ).not.toBeNull();
  expectNoCreateButton();
  const form = await fillValidProposalForm(CLIENT_ROUTE);
  await submit(form);
  expect(generic).not.toHaveBeenCalled();
  expect(book).not.toHaveBeenCalled();
  expect(location).toBe(CLIENT_ROUTE);
});

it("keeps the entered details and never falls back to generic creation when the canonical booking is rejected", async () => {
  bookingOptions();
  backend.values.set("useGetProposal", acceptedProposal());
  const book = command(SEAM_COMMAND);
  book.mockRejectedValue(
    new Error("ConcurrencyConflict: VERSION_MISMATCH expected 3 actual 4"),
  );
  const generic = command("useCreateEvent");
  await mount(
    createElement(EventCreatePage),
    "/events/new?proposalId=proposal-a",
  );
  await fillEventForm();
  await click(button("Create event"));
  await act(async () => {});
  expect(book).toHaveBeenCalledTimes(1);
  expect(generic).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "This record changed elsewhere",
  );
  expect(field("title").value).toBe("Summer dinner");
  expect(field("primaryContactName").value).toBe("Ada Cook");
});

it("prefills distinct proposal start and end dates, headcount, client, and venue on the real create form", async () => {
  bookingOptions();
  backend.values.set("useGetProposal", {
    _id: "proposal-a",
    title: "Anniversary dinner",
    clientId: "client-a",
    venueName: "  gArDeN  ",
    status: "accepted",
    version: 3,
    eventDate: new Date("2099-07-04T17:30").getTime(),
    eventEndDate: new Date("2099-07-04T22:00").getTime(),
    guestCount: 40,
    total: 2000,
  });
  await mount(
    createElement(EventCreatePage),
    "/events/new?proposalId=proposal-a",
  );
  expect(field("startsAt").value).toBe("2099-07-04T17:30");
  expect(field("endsAt").value).toBe("2099-07-04T22:00");
  expect(field("expectedHeadcount").value).toBe("40");
  expect(field("title").value).toBe("Anniversary dinner");
  expect(field("clientId").value).toBe("client-a");
  expect(field("venueId").value).toBe("venue-a");
});

// Issue #393: two active venues share the proposal's venue NAME — the form
// must not silently book the first match; the operator picks deliberately.
it("leaves a duplicate-name venue unpicked and makes the operator choose", async () => {
  bookingOptions();
  backend.values.set("useListVenue", [
    {
      _id: "venue-a",
      name: "Garden",
      status: "active",
      registeredAt: 1,
      capacity: 200,
    },
    {
      _id: "venue-b",
      name: "Garden",
      status: "active",
      registeredAt: 2,
      capacity: 60,
      addressLine1: "12 Lake Road",
    },
  ]);
  backend.values.set(
    "useGetProposal",
    acceptedProposal({ venueName: "Garden" }),
  );
  await mount(
    createElement(EventCreatePage),
    "/events/new?proposalId=proposal-a",
  );
  // Nothing is selected on the operator's behalf…
  expect(field("venueId").value).toBe("");
  // …and the form says the name is ambiguous rather than unmatched.
  expect(container.textContent).toContain("2 saved venues match “Garden”");
  expect(container.textContent).toContain(
    "pick the right one in the Venue panel",
  );
  expect(container.textContent).not.toContain("No saved venue matched");
  // The choice stays real: typing the second Garden's street picks that row.
  await chooseAccountOrVenue("venueId", "12 Lake Road");
  expect(field("venueId").value).toBe("venue-b");
});
