// @vitest-environment jsdom
import { createElement } from "react";
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
it("explains a missing client, then enforces the required contact before sending the event", async () => {
  bookingOptions();
  const create = command("useCreateEvent");
  await mount(createElement(EventCreatePage));
  const save = button("Create event");
  expect(save.disabled).toBe(true);
  expect(container.textContent).toContain("Client is required");
  change(selectWith("Select a client"), "client-a");
  change(selectWith("Select a venue"), "venue-a");
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
  expect(container.textContent).toContain("built-in service styles");
  expect(container.querySelectorAll('a[href="/admin/catalogs"]')).toHaveLength(
    2,
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
  expect(container.textContent).not.toContain("built-in service styles");
});

it("prefills distinct proposal start and end dates, headcount, client, and venue on the real create form", async () => {
  bookingOptions();
  backend.values.set("useGetProposal", {
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
  });
  await mount(
    createElement(EventCreatePage),
    "/events/new?proposalId=proposal-a",
  );
  expect(field("startsAt").value).toBe("2099-07-04T17:30");
  expect(field("endsAt").value).toBe("2099-07-04T22:00");
  expect(field("expectedHeadcount").value).toBe("40");
  expect(field("title").value).toBe("Anniversary dinner");
  expect(selectWith("Select a client").value).toBe("client-a");
  expect(selectWith("Select a venue").value).toBe("venue-a");
});
