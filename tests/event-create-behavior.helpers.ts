import { act, createElement } from "react";
import { expect } from "vitest";
import {
  backend,
  container,
  mount,
  input,
  field,
  change,
} from "./support/mounted-app";
import { EventCreatePage } from "../src/features/events/EventCreatePage";

export function selectWith(label: string) {
  const select = [...container.querySelectorAll("select")].find((node) =>
    [...node.options].some((option) => option.text === label),
  );
  expect(select, label).toBeDefined();
  return select!;
}
export function bookingOptions() {
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
export async function chooseAccountOrVenue(name: string, label: string) {
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
export const SEAM_COMMAND =
  "lib/proposalEventCreation:createEventFromAcceptedProposal";

// Route with the client preselected in the URL: used by the proposal states
// that cannot auto-fill the account from a proposal row (loading, missing,
// tombstoned).
export const CLIENT_ROUTE =
  "/events/new?proposalId=proposal-a&clientId=client-a";

export function acceptedProposal(overrides: Record<string, unknown> = {}) {
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

export async function fillEventForm() {
  input("title", "Summer dinner");
  input("eventType", "dinner");
  input("expectedHeadcount", "40");
  input("startsAt", "2099-07-04T17:30");
  input("endsAt", "2099-07-04T22:00");
  input("budgetAmount", "1000");
  input("quotedPrice", "2000");
  input("primaryContactName", "Ada Cook");
}

export async function mountProposalRoute(
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
export async function fillValidProposalForm(route: string) {
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
export function expectNoCreateButton() {
  expect(
    [...container.querySelectorAll("button")].map((node) =>
      node.textContent?.trim(),
    ),
  ).not.toContain("Create event");
}
