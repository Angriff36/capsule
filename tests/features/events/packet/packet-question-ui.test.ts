import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { FinalLockQuestionList } from "../../../../src/features/events/packet/FinalLockQuestions";
import type { FinalLockReport } from "../../../../src/lib/eventPacket/finalLock/evaluate";
import type { FinalLockAnswer } from "../../../../src/lib/eventPacket/finalLock/types";

const base = {
  policyVersion: "final-lock-1",
  ruleVersion: 1,
  sources: [],
  rule: "rule",
  missing: [],
  action: null,
  override: null,
  fieldWork: null,
  displayedInRevision: null,
  fingerprint: "f",
  basis: "b",
} satisfies Partial<FinalLockAnswer>;

const answers: FinalLockAnswer[] = [
  {
    ...base,
    questionKey: "identity.venue",
    group: "identity",
    section: "venue",
    label: "Venue",
    result: "answered",
    value: { type: "text", text: "Lakeside Lawn" },
    explanation: "Lakeside Lawn, 1 Shore Road.",
    resolver: "Sales",
    sources: [
      { table: "venues", id: "venue-1", version: 2 },
      { table: "events", id: "event-1", version: 7 },
    ],
  },
  {
    ...base,
    questionKey: "rentals.return",
    group: "rentals",
    section: "equipment",
    label: "Rentals after the event",
    result: "unresolved",
    value: { type: "none" },
    explanation: "No return owner for the rented tent.",
    missing: ["Tent has no return owner or window."],
    action: "Say who takes the tent back and when.",
    resolver: "Logistics",
  },
  {
    ...base,
    questionKey: "setup.rain_plan",
    group: "setup",
    section: "layouts",
    label: "Rain plan",
    result: "answered",
    value: { type: "text", text: "Move under the barn roof" },
    explanation: "From the event notes.",
    resolver: "Operations",
    override: {
      value: { type: "text", text: "Move under the barn roof" },
      reason: "Client asked on the phone",
      actor: "person-manager",
      at: "2026-10-01T15:00:00.000Z",
    },
  },
  {
    ...base,
    questionKey: "field.arrival",
    group: "field",
    section: "venue",
    label: "Event arrival",
    result: "field_confirmation",
    value: { type: "none" },
    explanation: "Done on the day.",
    resolver: "Operations",
    fieldWork: {
      form: "field.arrival",
      dueAt: Date.parse("2026-10-10T16:00:00Z"),
      confirmedAt: null,
      confirmedBy: null,
    },
  },
];

const report: FinalLockReport = {
  policyVersion: "final-lock-1",
  outcome: "needs_review",
  answers,
  staleQuestions: ["setup.rain_plan"],
  staleSections: ["layouts"],
  print: { policyVersion: "final-lock-1", answers: {}, lines: [] },
};

const render = (withOverride: boolean) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(FinalLockQuestionList, {
        eventId: "event-1",
        report,
        defaultOpen: true,
        onOverride: withOverride ? async () => undefined : undefined,
      }),
    ),
  );

const row = (html: string, key: string) => {
  const start = html.indexOf(`data-question="${key}"`);
  const next = html.indexOf("data-question=", start + 1);
  return html.slice(start, next === -1 ? undefined : next);
};

describe("Final Lock questions on the event workbook", () => {
  it("renders each question's result, answer, override and field-work due state", () => {
    const html = render(true);
    expect(html).toContain("NEEDS REVIEW · 1 need review");
    expect(html).toContain("Answers changed after the workbook was printed");

    const venue = row(html, "identity.venue");
    expect(venue).toContain("Answered");
    expect(venue).toContain("Lakeside Lawn, 1 Shore Road.");
    expect(venue).toContain("Settled by: Sales");
    expect(venue).toContain('href="/facilities/venues/venue-1"');
    expect(venue).toContain('href="/events/event-1?tab=overview"');

    const rentals = row(html, "rentals.return");
    expect(rentals).toContain("Needs review");
    expect(rentals).toContain("Tent has no return owner or window.");
    expect(rentals).toContain("Say who takes the tent back and when.");
    expect(rentals).toContain("Settled by: Logistics");
    expect(rentals).toContain("Decide this for this event");

    const rain = row(html, "setup.rain_plan");
    expect(rain).toContain("Manager decision · changed since printing");
    expect(rain).toContain("Reason: Client asked on the phone");
    expect(rain).toContain("Change the decision");

    const arrival = row(html, "field.arrival");
    expect(arrival).toContain("Done on the day");
    expect(arrival).toContain("Due ");
    // Day-of work is confirmed by the person who does it, never decided here.
    expect(arrival).not.toContain("Decide this for this event");
  });

  it("offers no decision form to a viewer who may not decide", () => {
    const html = render(false);
    expect(html).toContain("Rentals after the event");
    expect(html).not.toContain("Decide this for this event");
    expect(html).not.toContain("Change the decision");
  });
});
