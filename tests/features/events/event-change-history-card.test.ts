// @vitest-environment jsdom
// AC-636 screen leg — the event Pipeline stage sheet shows managers who made
// the event, every change (who, when, version after) and what each automatic
// follow-up did: the change it ran for, the version it used, what it kept as
// people left it, what is not finished and what waits on a manager. When the
// scratch folder .artifacts/llm-review exists, the rendered markup is written
// there for the llm-review judgment.
import { existsSync, writeFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordHistory } from "../../../src/lib/useRecordHistory";
import { EventChangeHistoryCard } from "../../../src/features/events/EventChangeHistoryCard";

const at = (hour: number) => Date.UTC(2026, 9, 3, hour, 5);
const history: RecordHistory = {
  recordId: "k1event",
  madeBy: null,
  changes: [
    {
      eventId: "k1ev3",
      at: at(16),
      change: "EventNotesChanged",
      step: "Event.updateNotes",
      byName: null,
      byRole: null,
      bySystem: false,
      retryKey: null,
      versionAfter: null,
      historyMissing: true,
    },
    {
      eventId: "k1ev2",
      at: at(15),
      change: "EventHeadcountChanged",
      step: "Event.changeHeadcount",
      byName: "Mona Lee",
      byRole: "event_manager",
      bySystem: false,
      retryKey: "k1retry",
      versionAfter: 4,
      historyMissing: false,
    },
    {
      eventId: "k1ev1",
      at: at(14),
      change: "EventCreated",
      step: "Event.create",
      byName: "Sam Ortiz",
      byRole: "sales",
      bySystem: false,
      retryKey: "k1retry0",
      versionAfter: 1,
      historyMissing: false,
    },
  ],
  followUps: [
    {
      domain: "prep",
      ranFor: "EventHeadcountChanged",
      ranForEventId: "k1ev2",
      at: at(15),
      inputCheckpoint: "a1b2c3d4e5",
      finished: true,
      created: 2,
      updated: 3,
      retired: 0,
      keptAsIs: 1,
      waiting: [],
    },
    {
      domain: "closeout",
      ranFor: "EventHeadcountChanged",
      ranForEventId: "k1ev2",
      at: at(15),
      inputCheckpoint: "f6e5d4c3b2",
      finished: false,
      created: 0,
      updated: 0,
      retired: 0,
      keptAsIs: 0,
      waiting: [{ code: "closeout_review", records: 2, whoCanAct: "Managers" }],
    },
  ],
};
history.madeBy = history.changes[2] ?? null;

let current: RecordHistory | null = history;
vi.mock("../../../src/lib/useRecordHistory", () => ({
  useRecordHistory: () => current,
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  current = history;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("event 'Change history' card", () => {
  it("answers who made it, who changed it and what Capsule did on its own", () => {
    act(() =>
      root.render(
        createElement(EventChangeHistoryCard, { eventId: "k1event" }),
      ),
    );
    for (const details of host.querySelectorAll("details")) details.open = true;
    const text = host.textContent ?? "";
    expect(text).toContain("Change history");
    expect(text).toContain("1 waiting on a manager");
    expect(text).toContain("Made by Sam Ortiz (sales)");
    expect(text).toContain("Event headcount changed");
    expect(text).toContain("Mona Lee (event manager)");
    expect(text).toContain("version 4 after");
    expect(text).toContain("Who did it was not saved");
    expect(text).toContain("No “who did it” note");
    expect(text).toContain("Prep tasks");
    expect(text).toContain(
      "Ran after: Event headcount changed. It used the event at version 4.",
    );
    expect(text).toContain("Made 2, changed 3, kept 1 as people left them.");
    expect(text).toContain("Closeout");
    expect(text).toContain("Not finished");
    expect(text).toContain("Event changed since");
    expect(text).toContain("Closeout review: 2 items wait for managers.");
    expect(text).toContain("Nothing needed to change.");
    expect(text).not.toMatch(/k1[a-z0-9]+|a1b2c3|Event\.change/);
    if (existsSync(".artifacts/llm-review")) {
      writeFileSync(
        ".artifacts/llm-review/AC-636-rendered.html",
        `<!-- EVENT PAGE, Pipeline stage sheet: "Change history" card (managers only), every part opened -->\n${host.innerHTML}\n`,
      );
    }
  });

  it("shows nothing to people who are not managers", () => {
    current = null;
    act(() =>
      root.render(
        createElement(EventChangeHistoryCard, { eventId: "k1event" }),
      ),
    );
    expect(host.textContent).toBe("");
  });
});
