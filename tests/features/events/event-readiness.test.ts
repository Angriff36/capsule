import { describe, expect, it } from "vitest";
import {
  EVENT_READINESS_DOMAINS,
  projectEventReadiness,
  readinessDomain,
  type EventReadinessFacts,
} from "../../../convex/lib/eventReadinessProjection";

function facts(
  overrides: Partial<EventReadinessFacts> = {},
): EventReadinessFacts {
  return {
    eventId: "ev-1",
    stage: "planning",
    clientId: "client-1",
    venueId: "venue-1",
    serviceStyleId: "style-1",
    expectedHeadcount: 40,
    quotedPrice: 4500,
    hasMenuDishes: true,
    assignedStaffIds: ["person-1"],
    openPrepTaskIds: [],
    inFlightPackListIds: [],
    inFlightDeliveryIds: [],
    openPurchaseNeedIds: [],
    openPacketIssueIds: [],
    closeoutId: null,
    closeoutStatus: null,
    ...overrides,
  };
}

function codesOf(projection: ReturnType<typeof projectEventReadiness>) {
  return projection.domains.flatMap((domain) =>
    domain.issues.map((issue) => issue.code),
  );
}

describe("projectEventReadiness", () => {
  it("always returns the nine domains in order, even with no issues", () => {
    const clean = facts({
      quotedPrice: 0,
      hasMenuDishes: true,
      assignedStaffIds: ["person-1"],
    });
    const projection = projectEventReadiness(clean);
    expect(projection.eventId).toBe("ev-1");
    expect(projection.domains.map((domain) => domain.domain)).toEqual([
      ...EVENT_READINESS_DOMAINS,
    ]);
    expect(
      projection.domains.every((domain) => domain.issues.length === 0),
    ).toBe(true);
  });

  it("treats quotedPrice 0 as a real seed and a missing price as a warning", () => {
    const seeded = projectEventReadiness(facts({ quotedPrice: 0 }));
    expect(codesOf(seeded)).not.toContain("commercial.quoted_price_missing");

    const missing = projectEventReadiness(facts({ quotedPrice: null }));
    const issue = readinessDomain(missing, "commercial").issues[0];
    expect(issue).toEqual({
      code: "commercial.quoted_price_missing",
      affectedIds: ["ev-1"],
      severity: "warning",
      reason: "This event has no quoted price to seed billing.",
      resolvingAction: "Event.changePricing",
    });

    const infinite = projectEventReadiness(facts({ quotedPrice: Number.NaN }));
    expect(codesOf(infinite)).toContain("commercial.quoted_price_missing");
  });

  it("marks a missing venue as info and a missing client as warning", () => {
    const projection = projectEventReadiness(
      facts({ venueId: null, clientId: null }),
    );
    const venue = readinessDomain(projection, "planning").issues.find(
      (issue) => issue.code === "planning.venue_missing",
    );
    expect(venue).toEqual({
      code: "planning.venue_missing",
      affectedIds: ["ev-1"],
      severity: "info",
      reason: "This event has no venue yet.",
      resolvingAction: "Event.changeVenue",
    });
    const client = readinessDomain(projection, "planning").issues.find(
      (issue) => issue.code === "planning.client_missing",
    );
    expect(client).toEqual({
      code: "planning.client_missing",
      affectedIds: ["ev-1"],
      severity: "warning",
      reason: "This event has no client yet.",
      resolvingAction: "Event.planEngagement",
    });
    expect(
      codesOf(projection).filter((code) => code.startsWith("planning.")),
    ).toEqual(["planning.client_missing", "planning.venue_missing"]);
  });

  it("emits kitchen.menu_empty only when the menu has no dishes", () => {
    const empty = projectEventReadiness(facts({ hasMenuDishes: false }));
    const issue = readinessDomain(empty, "kitchen").issues.find(
      (row) => row.code === "kitchen.menu_empty",
    );
    expect(issue).toEqual({
      code: "kitchen.menu_empty",
      affectedIds: ["ev-1"],
      severity: "warning",
      reason: "This event has no dishes on its menu.",
      resolvingAction: "EventDish.addToEvent",
    });
    expect(
      projectEventReadiness(facts({ hasMenuDishes: true }))
        .domains.flatMap((domain) => domain.issues)
        .some((issue) => issue.code === "kitchen.menu_empty"),
    ).toBe(false);
  });

  it("keeps an empty staffing list informational, not a warning", () => {
    const projection = projectEventReadiness(facts({ assignedStaffIds: [] }));
    const issue = readinessDomain(projection, "staffing").issues[0];
    expect(issue).toEqual({
      code: "staffing.assignment_missing",
      affectedIds: ["ev-1"],
      severity: "info",
      reason: "No staff are assigned to this event yet.",
      resolvingAction: "EventAssignment.assign",
    });
    expect(
      readinessDomain(projectEventReadiness(facts()), "staffing").issues,
    ).toEqual([]);
  });

  it("warns on a completed event without a closeout, stays quiet once finalized, and never blocks", () => {
    const missing = projectEventReadiness(facts({ stage: "completed" }));
    expect(readinessDomain(missing, "closeout").issues).toEqual([
      {
        code: "closeout.missing",
        affectedIds: ["ev-1"],
        severity: "warning",
        reason: "This event finished but has no closeout record.",
        resolvingAction: "Event.closeOut",
      },
    ]);

    const finalized = projectEventReadiness(
      facts({
        stage: "completed",
        closeoutId: "closeout-1",
        closeoutStatus: "finalized",
      }),
    );
    expect(readinessDomain(finalized, "closeout").issues).toEqual([]);

    const busy = projectEventReadiness(
      facts({
        openPrepTaskIds: ["prep-1"],
        inFlightPackListIds: ["pack-1"],
        inFlightDeliveryIds: ["delivery-1"],
      }),
    );
    const allIssues = busy.domains.flatMap((domain) => domain.issues);
    expect(allIssues.map((issue) => issue.code)).toEqual([
      "kitchen.prep_open",
      "packing.list_in_flight",
      "packing.delivery_in_flight",
      "execution.prep_open",
      "execution.pack_open",
      "execution.delivery_open",
    ]);
    expect(
      allIssues.filter((issue) => issue.code === "execution.prep_open"),
    ).toEqual([
      {
        code: "execution.prep_open",
        affectedIds: ["prep-1"],
        severity: "warning",
        reason: "Prep for this event is still open.",
        resolvingAction: "PrepTask.complete",
      },
    ]);
    expect(allIssues.every((issue) => issue.severity !== "blocking")).toBe(
      true,
    );
  });

  it("carries record ids for open purchase needs, packet issues, and draft closeouts", () => {
    const projection = projectEventReadiness(
      facts({
        openPurchaseNeedIds: ["need-1", "need-2"],
        openPacketIssueIds: ["packet-issue-1"],
        closeoutId: "closeout-9",
        closeoutStatus: "draft",
      }),
    );
    expect(
      readinessDomain(projection, "purchasing").issues.map((issue) => issue),
    ).toEqual([
      {
        code: "purchasing.need_open",
        affectedIds: ["need-1"],
        severity: "warning",
        reason: "A purchase need for this event is still open.",
        resolvingAction: "PurchaseNeed.create",
      },
      {
        code: "purchasing.need_open",
        affectedIds: ["need-2"],
        severity: "warning",
        reason: "A purchase need for this event is still open.",
        resolvingAction: "PurchaseNeed.create",
      },
    ]);
    expect(readinessDomain(projection, "packet").issues).toEqual([
      {
        code: "packet.issue_open",
        affectedIds: ["packet-issue-1"],
        severity: "warning",
        reason: "An open issue is on this event's packet.",
        resolvingAction: "EventPacketIssue.resolve",
      },
    ]);
    expect(readinessDomain(projection, "closeout").issues).toEqual([
      {
        code: "closeout.unfinalized",
        affectedIds: ["closeout-9"],
        severity: "warning",
        reason: "This event's closeout is still a draft.",
        resolvingAction: "EventCloseout.finalize",
      },
    ]);
  });
});
