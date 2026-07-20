import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { classifyCommandFailure } from "../src/features/events/CommandFailure";
import { EventGuestPolicy } from "../src/features/events/EventGuestPolicy";
import { EventLifecyclePolicy } from "../src/features/events/EventLifecyclePolicy";
import { FailureBanner } from "../src/features/events/FailureBanner";
import {
  eventCreatePath,
  eventDetailPath,
} from "../src/features/events/eventRoutes";

const read = (path: string) => readFileSync(path, "utf8");

describe("Event planning foundation", () => {
  it("creates Client, Venue, Event, and EventGuest through generated commands", () => {
    const mutations = read("convex/mutations.ts");
    const hooks = read("src/lib/manifest-convex-react.ts");
    for (const mutation of [
      "Client_createViaRegister",
      "Venue_createViaRegister",
      "Event_createViaPlanEngagement",
      "EventGuest_createViaInvite",
    ]) {
      expect(mutations).toContain(`export const ${mutation} = mutation({`);
    }
    for (const hook of [
      "useCreateClient",
      "useCreateVenue",
      "useCreateEvent",
      "useCreateEventGuest",
    ]) {
      expect(hooks).toContain(`export function ${hook}()`);
    }
    expect(existsSync("convex/lib/eventPlanning.ts")).toBe(false);
    expect(existsSync("src/features/events/eventPlanningApi.ts")).toBe(false);
  });

  it("navigates successful event creation directly to the real detail route", () => {
    expect(eventDetailPath("event_123")).toBe("/events/event_123");
    expect(eventCreatePath({ clientId: "client_9" })).toBe(
      "/events/new?clientId=client_9",
    );
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

  it("turns wrapped Convex guard failures into actionable creation guidance", () => {
    const failure = classifyCommandFailure(
      "[CONVEX M(mutations:Ingredient_createViaIntroduce)] [Request ID: a95c55eb16003c2d] Server Error\nUncaught Error: Guard 0 failed\nCalled by client",
    );
    expect(failure.category).toBe("guard_blocked");
    expect(failure.title).toBe("Ingredient wasn't created");
    expect(failure.detail).toBe(
      "Nothing was saved. Guard 0 failed. Request ID: a95c55eb16003c2d.",
    );
    expect(failure.detail).toContain("a95c55eb16003c2d");
    expect(failure.detail).toContain("Guard 0 failed");
    expect(failure.detail).not.toMatch(/lifecycle|refresh/i);
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
