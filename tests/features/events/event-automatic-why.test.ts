import { describe, expect, it } from "vitest";
import type { AutomaticExplanation } from "../../../src/lib/automaticExplanation";
import {
  groupAutomaticWhy,
  lastUpdatedLine,
} from "../../../src/features/events/eventAutomaticWhy";

const item = (
  over: Partial<AutomaticExplanation> &
    Pick<AutomaticExplanation, "kind" | "id">,
): AutomaticExplanation => ({
  version: 1,
  label: over.id,
  value: "",
  status: null,
  origin: "generated",
  sources: [],
  ruleVersion: null,
  why: "",
  stale: false,
  staleReason: null,
  lastReconciledAt: null,
  blocking: null,
  ...over,
});

describe("event 'Why is this here?' grouping", () => {
  it("groups by part of the event in work order and puts held-up then out-of-date items first", () => {
    const groups = groupAutomaticWhy([
      item({ kind: "task", id: "t1" }),
      item({ kind: "proposal_line", id: "p1" }),
      item({ kind: "task", id: "t2", stale: true }),
      item({
        kind: "task",
        id: "t3",
        blocking: { reason: "No recipe.", action: "Add one." },
      }),
    ]);
    expect(groups.map((g) => g.kind)).toEqual(["proposal_line", "task"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["t3", "t2", "t1"]);
    expect(groups[1].attention).toBe(2);
    expect(groups[0].label).toBe("Proposal lines");
  });

  it("returns no groups when Capsule made nothing", () => {
    expect(groupAutomaticWhy([])).toEqual([]);
  });

  it("says plainly when nothing was brought up to date yet", () => {
    expect(lastUpdatedLine(null)).toBe(
      "Capsule has not brought this up to date yet.",
    );
    expect(lastUpdatedLine(Date.UTC(2026, 9, 3, 14, 5))).toMatch(
      /^Last brought up to date /,
    );
  });
});
