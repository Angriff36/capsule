import { describe, expect, it } from "vitest";
import {
  eventLifecycleOutcomeMap,
  type LifecycleOutcomeName,
} from "../../../src/features/events/eventLifecycleOutcomeMap";
import { EVENT_STAGES } from "../../../src/features/events/eventStatus";

describe("EventLifecycleOutcomeMap", () => {
  it("canonical stages exclude confirmed", () => {
    expect(EVENT_STAGES).toHaveLength(10);
    expect(EVENT_STAGES).not.toContain("confirmed");
    expect(EVENT_STAGES).toContain("sales_lock");
    expect(EVENT_STAGES).toContain("executing");
    expect(EVENT_STAGES.indexOf("sales_lock")).not.toBe(
      EVENT_STAGES.indexOf("executing"),
    );
    expect(eventLifecycleOutcomeMap.hasConfirmedStage()).toBe(false);
  });

  it("maps every named outcome", () => {
    const expected: Record<
      LifecycleOutcomeName,
      { kind: string; canonical?: string; field?: string }
    > = {
      quote: { kind: "stage", canonical: "quote" },
      sales_lock: { kind: "stage", canonical: "sales_lock" },
      confirmed: { kind: "rejected" },
      execution: { kind: "stage", canonical: "executing" },
      final: { kind: "stage", canonical: "final" },
      completion: { kind: "stage", canonical: "completed" },
      cancellation: { kind: "stage", canonical: "cancelled" },
      archive: { kind: "flag", field: "archivedAt" },
      reopen: { kind: "flag", field: "archivedAt" },
    };
    for (const [name, want] of Object.entries(expected)) {
      const mapping = eventLifecycleOutcomeMap.map(
        name as LifecycleOutcomeName,
      );
      expect(mapping.kind).toBe(want.kind);
      if (want.kind === "stage") {
        expect(mapping.kind === "stage" && mapping.canonical).toBe(
          want.canonical,
        );
      }
      if (want.kind === "flag") {
        expect(mapping.kind === "flag" && mapping.field).toBe(want.field);
      }
    }
  });

  it("rejected confirmed is not executing", () => {
    const mapping = eventLifecycleOutcomeMap.map("confirmed");
    expect(mapping.kind).toBe("rejected");
    expect(
      mapping.kind === "rejected" && mapping.reason.length,
    ).toBeGreaterThan(0);
    expect(
      mapping.kind === "rejected" && /executing/.test(mapping.reason),
    ).toBe(true);
  });
});
