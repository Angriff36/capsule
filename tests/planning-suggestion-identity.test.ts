import { describe, expect, it } from "vitest";

import {
  ruleActionsJson,
  suggestionsForEvent,
  type RuleAction,
  type RuleReceipt,
  type SuggestionInput,
} from "../src/lib/planningRules";

const ruleWith = (actions: RuleAction[]) => ({
  _id: "rule-1",
  name: "Every event",
  trigger: "every_event",
  actionsJson: ruleActionsJson(actions),
  status: "active",
});

const input = (
  actions: RuleAction[],
  extra: Partial<SuggestionInput> = {},
): SuggestionInput => ({
  guests: 100,
  rules: [ruleWith(actions)],
  holds: [],
  equipment: [
    { _id: "eq-chafer", name: "Chafer" },
    { _id: "eq-linen", name: "Linen" },
  ],
  parts: [],
  positionCount: () => 0,
  hasTask: () => false,
  receipts: [],
  ...extra,
});

const action = (
  kind: RuleAction["kind"],
  target: string,
  base = 2,
): RuleAction => ({ kind, target, base, perGuest: 0, perTrigger: 0 });

describe("planning suggestion identity", () => {
  it("an edited line gets a new key, so an old turn-down does not hide it", () => {
    const [before] = suggestionsForEvent(
      input([action("equipment", "eq-chafer")]),
    );
    const declined: RuleReceipt = {
      _id: "r1",
      version: 1,
      suggestionKey: before.key,
      quantity: 2,
      declined: true,
      basis: before.basis,
    };
    // Same line, still turned down: hidden.
    expect(
      suggestionsForEvent(
        input([action("equipment", "eq-chafer")], { receipts: [declined] }),
      ),
    ).toHaveLength(0);
    // The line now asks for different equipment at the same place.
    const after = suggestionsForEvent(
      input([action("equipment", "eq-linen")], { receipts: [declined] }),
    );
    expect(after).toHaveLength(1);
    expect(after[0].key).not.toBe(before.key);
    expect(after[0].receipt).toBeUndefined();
    expect(after[0].label).toBe("Linen");
    // Kind changed, same text: also new.
    const [asTask] = suggestionsForEvent(input([action("task", "eq-chafer")]));
    expect(asTask.key).not.toBe(before.key);
  });

  it("an edited to-do line is not met by the to-do made from the old line", () => {
    const [old] = suggestionsForEvent(input([action("task", "Ice the bar")]));
    const tasks = new Set([old.key]);
    const hasTask = (key: string) => tasks.has(key);
    expect(
      suggestionsForEvent(input([action("task", "Ice the bar")], { hasTask })),
    ).toHaveLength(0);
    const fresh = suggestionsForEvent(
      input([action("task", "Set the cake table")], { hasTask }),
    );
    expect(fresh).toHaveLength(1);
    expect(fresh[0].target).toBe("Set the cake table");
  });

  it("removing an earlier line keeps the answers on the later lines", () => {
    const both = suggestionsForEvent(
      input([action("task", "Ice the bar"), action("position", "Bartender")]),
    );
    const bartender = both.find((row) => row.kind === "position")!;
    const declined: RuleReceipt = {
      _id: "r2",
      version: 1,
      suggestionKey: bartender.key,
      quantity: 2,
      declined: true,
      basis: bartender.basis,
    };
    const left = suggestionsForEvent(
      input([action("position", "Bartender")], { receipts: [declined] }),
    );
    expect(left).toHaveLength(0);
  });

  it("two lines asking the same thing keep separate keys", () => {
    const rows = suggestionsForEvent(
      input([action("task", "Ice the bar"), action("task", "ice the bar ")]),
    );
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
  });
});
