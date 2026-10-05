import { describe, expect, it } from "vitest";
import { buildLifecycleModel } from "../src/lib/lifecycle/lifecycleModel";

const definition = {
  label: "Test",
  path: ["draft", "sent", "paid"],
  sideStates: ["voided"],
  actions: [
    { key: "send", label: "Send", to: "sent" },
    { key: "reopen", label: "Reopen", to: "draft" },
    { key: "void", label: "Void", to: "voided", needsInput: true },
  ],
} as const;

describe("buildLifecycleModel", () => {
  it("marks the path through the current state and puts available commands on next nodes", () => {
    const model = buildLifecycleModel(definition, "draft");
    expect(model.nodes.map((node) => node.kind)).toEqual([
      "current",
      "next",
      "future",
    ]);
    expect(model.nodes[1]?.actions).toEqual([definition.actions[0]]);
  });

  it("keeps a terminal branch out of the horizontal path", () => {
    const model = buildLifecycleModel(definition, "voided");
    expect(model.isSideState).toBe(true);
    expect(model.nodes.every((node) => node.kind === "future")).toBe(true);
  });

  it("keeps an unknown status visible without crashing the stepper", () => {
    const model = buildLifecycleModel(definition, "migrated");
    expect(model.isUnknown).toBe(true);
    expect(model.nodes[0]?.kind).toBe("unknown");
  });

  it("keeps backward and branch moves reachable beside the path", () => {
    const model = buildLifecycleModel(
      {
        ...definition,
        actions: definition.actions.filter((action) => action.key !== "send"),
      },
      "sent",
    );
    expect(model.otherActions.map((action) => action.key)).toEqual([
      "reopen",
      "void",
    ]);
    expect(model.nodes.flatMap((node) => node.actions)).toEqual([]);
  });
});
