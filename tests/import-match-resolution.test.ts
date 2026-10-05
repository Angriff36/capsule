// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it } from "vitest";
import {
  backend,
  button,
  click,
  command,
  container,
  input,
  mount,
} from "./support/mounted-app";
import { ExternalRecordsReconcilePage } from "../src/features/admin/import/ExternalRecordsReconcilePage";

// PL-SOURCE-RESOLUTION (AC-059): each waiting import item shows its old row
// beside its Capsule record and can be pointed at an existing record or a
// new one of the right kind; a group Verify/Skip lists every item it changes
// before it runs.

const venueLink = {
  _id: "link-venue",
  sourceSystem: "tpp_legacy",
  recordType: "venue",
  capsuleEntity: "venue",
  externalId: "V-2",
  capsuleId: "venue-made",
  conflictStatus: "pending_conflict",
  resolutionNote: "Same address as The Grand Hall",
  rawSourceData: JSON.stringify({
    name: "Grand Hall at Main",
    addressLine1: "10 Main St",
    city: "Chicago",
  }),
  createdAt: 1,
};
const contactLink = {
  _id: "link-contact",
  sourceSystem: "tpp_legacy",
  recordType: "contact",
  capsuleEntity: "client",
  externalId: "C-2",
  capsuleId: "",
  conflictStatus: "pending_conflict",
  rawSourceData: JSON.stringify({ givenName: "Harbor", familyName: "Foods" }),
  createdAt: 1,
};

function setUp() {
  // The page reads only the rows it works with (pending and payments).
  backend.values.set("externalRecordLinkLists:listFor", [
    venueLink,
    contactLink,
  ]);
  backend.values.set("importResolution:itemRecordLabels", {
    "link-venue": "Grand Hall at Main",
  });
}
const row = (externalId: string) =>
  [...container.querySelectorAll("tbody tr")].find((tr) =>
    tr.textContent?.includes(externalId),
  ) as HTMLElement;

it("shows the old row beside its Capsule record", async () => {
  setUp();
  await mount(createElement(ExternalRecordsReconcilePage));
  expect(row("V-2").textContent).toContain("Grand Hall at Main");
  expect(row("V-2").textContent).toContain("10 Main St, Chicago");
  expect(row("C-2").textContent).toContain("Harbor Foods");
  expect(row("C-2").textContent).toContain("Not linked yet");
});

it("points a row at an existing record", async () => {
  setUp();
  backend.values.set("importResolution:findRecordsForItem", [
    { id: "venue-1", label: "The Grand Hall" },
  ]);
  const choose = command("importResolution:chooseExistingRecord", {
    label: "The Grand Hall",
    leftBehind: "Grand Hall at Main",
  });
  await mount(createElement(ExternalRecordsReconcilePage));
  await click(button("Pick existing", row("V-2")));
  input("recordSearch", "Grand", row("V-2"));
  await click(button("The Grand Hall", row("V-2")));
  expect(choose).toHaveBeenCalledWith({
    linkId: "link-venue",
    recordId: "venue-1",
  });
  expect(container.textContent).toContain(
    "Matched to The Grand Hall. Later imports of this row use it.",
  );
  expect(container.textContent).toContain(
    "Grand Hall at Main, which the import added, is still in Capsule",
  );
});

it("adds a contact row as a company", async () => {
  setUp();
  const add = command("importResolution:addRecordForItem", {
    id: "client-1",
    label: "Harbor Foods",
  });
  await mount(createElement(ExternalRecordsReconcilePage));
  expect(() => button("Add as a person", row("V-2"))).toThrow();
  await click(button("Add as a company", row("C-2")));
  expect(add).toHaveBeenCalledWith({
    linkId: "link-contact",
    clientType: "company",
  });
  expect(container.textContent).toContain("Added Harbor Foods.");
});

it("lists every affected item before a group Verify runs", async () => {
  setUp();
  const verify = command("useExternalRecordLinkVerifyLink", {});
  await mount(createElement(ExternalRecordsReconcilePage));
  for (const id of ["V-2", "C-2"]) {
    await click(row(id).querySelector("input[type=checkbox]") as HTMLElement);
  }
  await click(button("Verify Selected"));
  expect(verify).not.toHaveBeenCalled();
  const preview = container.querySelector(
    '[aria-label="Verify preview"]',
  ) as HTMLElement;
  expect(preview.textContent).toContain(
    "Grand Hall at Main — Checked; stays matched to Grand Hall at Main",
  );
  expect(preview.textContent).toContain(
    "Harbor Foods — Checked; nothing in Capsule is matched",
  );
  await click(button("Verify 2"));
  expect(verify).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain("Checked 2 item(s).");
});
