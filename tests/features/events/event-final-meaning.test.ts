import { describe, expect, it } from "vitest";
import { eventFinalMeaning } from "../../../src/features/events/eventFinalMeaning";
import { EVENT_STAGES } from "../../../src/features/events/eventStatus";

describe("EventFinalMeaning", () => {
  it("final means service finished and is a real stage", () => {
    expect(EVENT_STAGES).toContain("final");
    expect(eventFinalMeaning.stage()).toBe("final");
    expect(eventFinalMeaning.meaning()).toBe("service_finished");
  });

  it("ops final is readiness, not a stage", () => {
    expect(eventFinalMeaning.hasOpsFinalStage()).toBe(false);
    expect(EVENT_STAGES).not.toContain("ops_final");
    expect(EVENT_STAGES).not.toContain("opsFinal");
    expect(EVENT_STAGES).not.toContain("confirmed");
    expect(eventFinalMeaning.opsFinalKind()).toBe("readiness");
    expect(eventFinalMeaning.opsFinalReadinessDomain()).toBe("packet");
  });

  it("finalize does not require ops final review", () => {
    expect(eventFinalMeaning.requiresOpsFinalReview()).toBe(false);
  });
});
