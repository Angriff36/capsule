// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  container,
  mount,
  command,
  input,
  button,
  click,
} from "./support/mounted-app";
import { EventGuestPanel } from "../src/features/events/EventGuestPanel";
import type { Id } from "../src/lib/api";
const eventId = "event-a" as Id<"events">;
const guest = {
  _id: "guest-a",
  eventId,
  name: "Ada Cook",
  invitedAt: 1,
  rsvpStatus: "pending",
  version: 4,
  checkedInAt: null,
};
const page = () =>
  createElement(EventGuestPanel, { eventId, expectedHeadcount: 40 });

it("creates an invited guest with their dietary, allergen and accessibility details", async () => {
  backend.values.set("queries:listEventGuestByEventId", []);
  const invite = command("useCreateEventGuest");
  await mount(page());
  await click(button("Invite guest"));
  input("name", " Ada Cook ");
  input("email", "ada@example.test");
  input("dietaryRestrictions", " vegan, gluten-free ");
  input("allergenRestrictions", " peanuts ");
  input("accessibilityNeeds", " ramp ");
  await click(
    container.querySelector<HTMLInputElement>('[name="specialMealRequired"]')!,
  );
  await click(button("Invite guest", container.querySelector("form")!));
  expect(invite).toHaveBeenCalledExactlyOnceWith({
    eventId,
    name: "Ada Cook",
    email: "ada@example.test",
    phone: undefined,
    dietaryRestrictions: ["vegan", "gluten-free"],
    allergenRestrictions: ["peanuts"],
    accessibilityNeeds: ["ramp"],
    specialMealRequired: true,
  });
  expect(container.querySelector('[name="name"]')).toBeNull();
});
it.each([
  ["Confirm RSVP", "useEventGuestRsvpConfirm", null, {}],
  [
    "Decline RSVP",
    "useEventGuestRsvpDecline",
    "Cannot attend",
    { reason: "Cannot attend" },
  ],
  [
    "Assign table",
    "useEventGuestAssignTable",
    " 12 ",
    { tableAssignment: "12" },
  ],
  [
    "Withdraw guest",
    "useEventGuestWithdraw",
    "Duplicate invitation",
    { reason: "Duplicate invitation" },
  ],
])(
  "submits %s for the selected guest with its current version",
  async (label, hook, value, extra) => {
    backend.values.set("queries:listEventGuestByEventId", [guest]);
    const action = command(hook);
    await mount(page());
    await click(container.querySelector<HTMLElement>("summary")!);
    await click(button(label));
    if (value !== null) {
      expect(action).not.toHaveBeenCalled();
      input("value", value);
      await click(button("Apply"));
    }
    expect(action).toHaveBeenCalledExactlyOnceWith({
      docId: "guest-a",
      version: 4,
      ...extra,
    });
  },
);
it("checks in a confirmed guest and prevents another check-in after the server update", async () => {
  backend.values.set("queries:listEventGuestByEventId", [
    { ...guest, rsvpStatus: "confirmed" },
  ]);
  const checkIn = command("useEventGuestCheckIn");
  await mount(page());
  await click(button("Check in"));
  expect(checkIn).toHaveBeenCalledExactlyOnceWith({
    docId: "guest-a",
    version: 4,
  });
  backend.values.set("queries:listEventGuestByEventId", [
    { ...guest, rsvpStatus: "confirmed", checkedInAt: 123, version: 5 },
  ]);
  await mount(page());
  expect(
    [...container.querySelectorAll("button")].some(
      (node) => node.textContent === "Check in",
    ),
  ).toBe(false);
});
