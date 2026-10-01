// @vitest-environment jsdom
// AC-642 screen leg — the event readiness sheet shows, for each thing Capsule
// filled in, why it exists, who changed it, if it is out of date and what
// holds it up, in plain words (no record ids). When the scratch folder
// .artifacts/llm-review exists, the rendered markup is written there for the
// llm-review judgment.
import { existsSync, writeFileSync } from "node:fs";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomaticExplanation } from "../../../src/lib/automaticExplanation";
import { EventAutomaticWhyCard } from "../../../src/features/events/EventAutomaticWhyCard";

const items: AutomaticExplanation[] = [
  {
    kind: "proposal_line",
    id: "k1proposalline",
    version: 3,
    label: "Grilled chicken, buffet",
    value: "120 guests × $18",
    status: null,
    origin: "generated",
    sources: [{ table: "eventDishes", id: "k1dish" }],
    ruleVersion: "proposal-plan v2",
    why: "Made from the chicken dish on the event menu, priced per guest.",
    stale: false,
    staleReason: null,
    lastReconciledAt: Date.UTC(2026, 9, 3, 14, 5),
    blocking: null,
  },
  {
    kind: "task",
    id: "k1prep",
    version: 1,
    label: "Marinate chicken",
    value: "40 lb",
    status: "open",
    origin: "overridden",
    sources: [{ table: "eventDishes", id: "k1dish" }],
    ruleVersion: null,
    why: "The chicken recipe needs a marinade the day before.",
    stale: true,
    staleReason: "The guest count changed after this task was made.",
    lastReconciledAt: Date.UTC(2026, 9, 3, 14, 5),
    blocking: null,
  },
  {
    kind: "pack_line",
    id: "k1pack",
    version: 2,
    label: "Chafing dish",
    value: "6",
    status: null,
    origin: "generated",
    sources: [],
    ruleVersion: null,
    why: "Buffet service needs one chafing dish per hot item.",
    stale: false,
    staleReason: null,
    lastReconciledAt: null,
    blocking: {
      reason: "Only 4 are free that day.",
      action: "Rent 2 more or swap the style.",
    },
  },
];

vi.mock("../../../src/lib/useEventAutomaticExplanations", () => ({
  useEventAutomaticExplanations: () => ({ eventId: "k1event", items }),
}));

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("event 'Why is this here?' card", () => {
  it("shows why, who changed it, out-of-date and held-up items in plain words", () => {
    act(() =>
      root.render(
        createElement(EventAutomaticWhyCard, { eventId: "k1event" as never }),
      ),
    );
    for (const details of host.querySelectorAll("details")) details.open = true;
    const text = host.textContent ?? "";
    expect(text).toContain("Why is this here?");
    expect(text).toContain("2 need a look");
    expect(text).toContain("Proposal lines");
    expect(text).toContain("Made from the chicken dish on the event menu");
    expect(text).toContain("Changed by a person");
    expect(text).toContain("Out of date");
    expect(text).toContain("The guest count changed after this task was made.");
    expect(text).toContain("Held up");
    expect(text).toContain("Rent 2 more or swap the style.");
    expect(text).toContain("Capsule has not brought this up to date yet.");
    expect(text).toContain("Comes from the event menu; rule proposal-plan v2.");
    expect(text).toContain(
      "Comes from the event menu; not made from a saved rule.",
    );
    expect(text).toContain(
      "Capsule did not keep what this came from; not made from a saved rule.",
    );
    expect(text).not.toMatch(/k1[a-z]+|eventDishes/);
    if (existsSync(".artifacts/llm-review")) {
      writeFileSync(
        ".artifacts/llm-review/AC-642-rendered.html",
        `<!-- EVENT PAGE, Before approval sheet: "Why is this here?" card, every part opened -->\n${host.innerHTML}\n`,
      );
    }
  });
});
