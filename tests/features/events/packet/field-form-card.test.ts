import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/lib/fileStorageClient", () => ({
  useGenerateUploadUrl: () => async () => "https://upload.test",
}));

import { FieldFormCard } from "../../../../src/features/events/packet/FieldFormCard";
import type { FieldFormRow } from "../../../../src/lib/eventPacket/useFieldForms";

const NOW = Date.parse("2026-10-10T19:00:00Z");

const form = (over: Partial<FieldFormRow>): FieldFormRow => ({
  id: "form-1" as FieldFormRow["id"],
  version: 1,
  eventId: "event-1",
  formKey: "field.arrival",
  label: "Event arrival",
  status: "open",
  needsTwoPeople: false,
  evidence: "none",
  dueAt: Date.parse("2026-10-10T17:00:00Z"),
  responsiblePersonId: "p-lena",
  responsible: "Lena Crew",
  secondPersonId: null,
  second: null,
  instructions: "Meet the contact and check the room.",
  expectedItems: null,
  completedBy: null,
  completedById: null,
  observedAt: null,
  outcome: null,
  note: null,
  answers: null,
  photoUrl: null,
  checkedBy: null,
  secondObservedAt: null,
  secondNote: null,
  escalatedAt: null,
  escalatedBy: null,
  escalationNote: null,
  ...over,
});

const render = (row: FieldFormRow, myPersonId: string | null = null) =>
  renderToStaticMarkup(
    createElement(FieldFormCard, {
      form: row,
      now: NOW,
      myPersonId,
      onComplete: async () => null,
      onCountersign: async () => null,
    }),
  );

describe("day-of form card", () => {
  it("an open late form names who is down to do it and offers the sign form", () => {
    const html = render(form({}));
    expect(html).toContain("Late - due");
    expect(html).toContain("Down to do it: Lena Crew");
    expect(html).toContain("Meet the contact and check the room.");
    expect(html).toContain("Fill in this form");
  });

  it("a photo form asks for a photo; a note form asks what you saw", () => {
    expect(render(form({ evidence: "photo" }))).toContain('type="file"');
    expect(
      render(form({ formKey: "field.after-event", evidence: "note" })),
    ).toContain("What you saw");
  });

  it("a paper form lists its lines to tick; unticked lines ask why", () => {
    const html = render(form({}));
    expect(html).toContain("Found the person in charge");
    expect(html).toContain("10 lines are not ticked");
    expect(html).toContain("What was not done, and why");
  });

  it("the food waste form counts leftovers against the menu", () => {
    const html = render(
      form({
        formKey: "field.muda",
        evidence: "note",
        expectedItems: "Coconut Prawns; Beef Satay",
      }),
    );
    expect(html).toContain("Menu: Coconut Prawns; Beef Satay");
    expect(html).toContain("About how many guests came?");
    expect(html).toContain("Anything else (optional)");
  });

  it("the first signer is not offered the second check; someone else is", () => {
    const signed = form({
      needsTwoPeople: true,
      status: "first_signed",
      completedBy: "Dario Crew",
      completedById: "p-dario",
    });
    expect(render(signed, "p-dario")).not.toContain("second person</summary>");
    expect(render(signed, "p-dario")).toContain("Needs a second person");
    expect(render(signed, "p-lena")).toContain(
      "Check it too and sign as the second person",
    );
  });

  it("a done form shows who did it, and no sign form", () => {
    const html = render(
      form({
        status: "done",
        completedBy: "Lena Crew",
        observedAt: Date.parse("2026-10-10T17:05:00Z"),
        outcome: "problem",
        note: "Tables were in the wrong room",
      }),
    );
    expect(html).toContain("Done by Lena Crew");
    expect(html).toContain("Problem reported");
    expect(html).toContain("Tables were in the wrong room");
    expect(html).not.toContain("Fill in this form");
  });
});
