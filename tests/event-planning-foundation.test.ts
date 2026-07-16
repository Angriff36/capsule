import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { classifyCommandFailure } from "../src/features/events/CommandFailure";
import { EventGuestPolicy } from "../src/features/events/EventGuestPolicy";
import { EventLifecyclePolicy } from "../src/features/events/EventLifecyclePolicy";
import { FailureBanner } from "../src/features/events/FailureBanner";
import { eventDetailPath } from "../src/features/events/eventRoutes";

const read = (path: string) => readFileSync(path, "utf8");

describe("Event planning foundation", () => {
  it("creates Client, Venue, Event, and EventGuest through generated commands", () => {
    const seam = read("convex/lib/eventPlanning.ts");
    expect(seam).toContain("api.mutations.Client_register");
    expect(seam).toContain("api.mutations.Venue_register");
    expect(seam).toContain("api.mutations.Event_planEngagement");
    expect(seam).toContain("api.mutations.EventGuest_invite");
    expect(seam).toContain("discardAfterFailure");
  });

  it("navigates successful event creation directly to the real detail route", () => {
    expect(eventDetailPath("event_123")).toBe("/events/event_123");
    expect(read("src/features/events/EventCreatePage.tsx")).toContain(
      "navigate(eventDetailPath(created.docId))",
    );
    expect(read("src/app/App.tsx")).toContain(
      '<Route path="/events/:id" element={<EventDetailPage />} />',
    );
  });

  it("derives every legal Event lifecycle offer from generated transitions", () => {
    const policy = new EventLifecyclePolicy();
    expect(
      policy.availableActions("planning").map((action) => action.key),
    ).toEqual(["submitForApproval", "cancel"]);
    expect(
      policy.availableActions("pending_approval").map((action) => action.key),
    ).toEqual(["returnToPlanning", "approve", "cancel"]);
    expect(
      policy.availableActions("approved").map((action) => action.key),
    ).toEqual(["returnToPlanning", "beginExecution", "cancel"]);
    expect(
      policy.availableActions("executing").map((action) => action.key),
    ).toEqual(["complete", "cancel"]);
    expect(
      policy.availableActions("completed").map((action) => action.key),
    ).toEqual(["closeOut"]);
    expect(policy.availableActions("closed_out")).toEqual([]);
  });

  it("offers guest operations from generated lifecycle and live guest state", () => {
    const policy = new EventGuestPolicy();
    const pending = {
      rsvpStatus: "pending",
      checkedInAt: null,
      deletedAt: null,
    };
    const confirmed = {
      rsvpStatus: "confirmed",
      checkedInAt: null,
      deletedAt: null,
    };
    const declined = {
      rsvpStatus: "declined",
      checkedInAt: null,
      deletedAt: null,
    };
    expect(policy.canConfirm(pending)).toBe(true);
    expect(policy.canDecline(confirmed)).toBe(true);
    expect(policy.canCheckIn(confirmed)).toBe(true);
    expect(policy.canAssignTable(declined)).toBe(false);
    expect(policy.canWithdraw(pending)).toBe(true);
  });

  it("renders denied, validation, guard, conflict, and unexpected failures distinctly", () => {
    expect(
      classifyCommandFailure("Event staff may execute event commands").category,
    ).toBe("denied");
    expect(
      classifyCommandFailure("Event end must be after its start").category,
    ).toBe("validation");
    expect(classifyCommandFailure("Guard 2 failed").category).toBe(
      "guard_blocked",
    );
    expect(
      classifyCommandFailure("ConcurrencyConflict: VERSION_MISMATCH").category,
    ).toBe("conflict");
    expect(classifyCommandFailure("socket vanished").category).toBe(
      "unexpected",
    );
    const markup = renderToStaticMarkup(
      createElement(FailureBanner, {
        failure: classifyCommandFailure("Guard 2 failed"),
      }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-failure-category="guard_blocked"');
  });

  it("wires every supported guest command into the dossier", () => {
    const panel = read("src/features/events/EventGuestPanel.tsx");
    for (const hook of [
      "useEventGuestAssignTable",
      "useEventGuestCheckIn",
      "useEventGuestRsvpConfirm",
      "useEventGuestRsvpDecline",
      "useEventGuestWithdraw",
      "useCreateEventGuest",
    ]) {
      expect(panel).toContain(hook);
    }
  });
});
