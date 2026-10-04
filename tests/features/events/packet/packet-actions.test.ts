import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import * as commands from "../../../../convex/lib/eventPacket/commands";
import * as finalLock from "../../../../convex/lib/eventPacket/finalLock";
import * as mutations from "../../../../convex/mutations";
import { FinalLockQuestionList } from "../../../../src/features/events/packet/FinalLockQuestions";
import type { FinalLockReport } from "../../../../src/lib/eventPacket/finalLock/evaluate";
import type { FinalLockAnswer } from "../../../../src/lib/eventPacket/finalLock/types";

interface Registered {
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
  exportArgs: () => string;
}
const publicWrites = (module: Record<string, unknown>) =>
  Object.entries(module)
    .filter(([, fn]) => {
      const f = fn as Registered | undefined;
      return !!f && (f.isMutation || f.isAction) && f.isPublic;
    })
    .map(([name]) => name)
    .sort();

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
  resolver: "Operations",
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
  },
  {
    ...base,
    questionKey: "field.arrival",
    group: "field",
    section: "venue",
    label: "Event arrival",
    result: "field_confirmation",
    value: { type: "none" },
    explanation: "Done on the day by the crew.",
    fieldWork: {
      form: "field.arrival",
      prepared: true,
      status: "open",
      dueAt: Date.parse("2026-10-02T21:00:00Z"),
      responsible: "Lena Crew",
      confirmedAt: null,
      confirmedBy: null,
    },
  },
];
const report = {
  outcome: "needs_review",
  answers,
  staleQuestions: [],
  staleSections: [],
} as unknown as FinalLockReport;

describe("event packet actions", () => {
  it("offers resolve/prepare/override/record-confirmation and nothing that retypes derived answers", () => {
    // The whole server write surface of the event packet: upload + import
    // evidence, resolve a fact, prepare (record) a print, a manager override,
    // setting up day-of forms. No command writes a derived answer's value.
    expect(publicWrites(commands)).toEqual([
      "generatePacketUploadUrl",
      "importEvidence",
      "recordPacketRevision",
      "registerPacketUpload",
      "resolveOperationalIssue",
      "uploadPacketFile",
    ]);
    expect(publicWrites(finalLock)).toEqual([
      "overrideFinalLockAnswer",
      "prepareFieldForms",
    ]);
    // An override is an authorized decision: it always carries a reason.
    const overrideArgs = JSON.parse(
      (finalLock.overrideFinalLockAnswer as unknown as Registered).exportArgs(),
    );
    expect(Object.keys(overrideArgs.value)).toContain("reason");
    expect(overrideArgs.value.reason.optional).toBe(false);
    // Physical confirmation is recorded on the day-of form by the person who did it.
    for (const name of [
      "FieldConfirmation_complete",
      "FieldConfirmation_countersign",
    ])
      expect(
        (mutations as unknown as Record<string, Registered | undefined>)[name]
          ?.isPublic,
      ).toBe(true);

    // On screen: an answer shows why and where it came from; the only form
    // is the manager decision, and day-of work offers no office form at all.
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(FinalLockQuestionList, {
          eventId: "event-1",
          report,
          onOverride: async () => null,
          defaultOpen: true,
        }),
      ),
    );
    const row = (key: string) =>
      html.slice(
        html.indexOf(`data-question="${key}"`),
        html.indexOf("</li>", html.indexOf(`data-question="${key}"`)),
      );
    // The answer shows once; a "Why" that only repeats it is left out.
    expect(row("identity.venue")).toContain("Lakeside Lawn, 1 Shore Road.");
    expect(row("identity.venue")).not.toContain("Why: Lakeside Lawn");
    expect(row("identity.venue")).toContain("Decide this for this event");
    expect(row("identity.venue")).toContain("Why this event is different");
    expect(row("field.arrival")).toContain("Lena Crew is down to do it");
    expect(row("field.arrival")).not.toContain("<input");
    expect(row("field.arrival")).not.toContain("Decide this for this event");
    // Outside a manager decision there is no box to type an answer into.
    const outsideDecisions = html.replace(/<details[\s\S]*?<\/details>/g, "");
    expect(outsideDecisions).not.toMatch(/<input|<textarea|<select/);
  });
});
