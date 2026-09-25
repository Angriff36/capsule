import { describe, expect, it } from "vitest";
import { EventDuplicatePlanning } from "../../../convex/lib/eventDuplicatePlanning";

const base = {
  clientId: "client-1",
  title: "Summer gala",
  eventType: "corporate dinner",
  startsAt: 1000,
  endsAt: 2000,
  expectedHeadcount: 40,
  primaryContactName: "Casey Duplicate",
};

describe("EventDuplicatePlanning.copyTitle", () => {
  it("trims the title and adds a copy suffix", () => {
    expect(EventDuplicatePlanning.copyTitle("  Summer gala  ")).toBe(
      "Summer gala (copy)",
    );
  });

  it("refuses an empty or whitespace title", () => {
    expect(() => EventDuplicatePlanning.copyTitle("   ")).toThrow(
      "Event title is required",
    );
    expect(() => EventDuplicatePlanning.copyTitle("")).toThrow(
      "Event title is required",
    );
  });
});

describe("EventDuplicatePlanning.planArgs", () => {
  it("copies planning facts, defaults money to 0, and titles the copy", () => {
    const args = EventDuplicatePlanning.planArgs({
      ...base,
      title: "  Gala  ",
      budgetAmount: null,
      quotedPrice: null,
    });
    expect(args.title).toBe("Gala (copy)");
    expect(args.clientId).toBe("client-1");
    expect(args.eventType).toBe("corporate dinner");
    expect(args.startsAt).toBe(1000);
    expect(args.endsAt).toBe(2000);
    expect(args.expectedHeadcount).toBe(40);
    expect(args.primaryContactName).toBe("Casey Duplicate");
    expect(args.budgetAmount).toBe(0);
    expect(args.quotedPrice).toBe(0);
  });

  it("throws one clear sentence per missing required fact", () => {
    for (const key of [
      "clientId",
      "eventType",
      "startsAt",
      "endsAt",
      "primaryContactName",
    ] as const) {
      const source = {
        ...base,
        [key]: key === "startsAt" || key === "endsAt" ? null : undefined,
      };
      expect(() => EventDuplicatePlanning.planArgs(source)).toThrow(
        /cannot be duplicated/,
      );
    }
    expect(() =>
      EventDuplicatePlanning.planArgs({ ...base, expectedHeadcount: null }),
    ).toThrow(
      "This event is missing a guest count, so it cannot be duplicated.",
    );
  });

  it("passes snapshots through when present and omits them when null", () => {
    const full = EventDuplicatePlanning.planArgs({
      ...base,
      clientName: "Monasmith",
      serviceStyleId: "style-1",
      serviceStyleName: "Plated",
      occasionId: "occasion-1",
      occasionName: "Wedding",
      venueId: "venue-1",
      venueName: "Garden Hall",
      venueAddress: "1 Garden Way",
      venueCapacity: 120,
      primaryContactEmail: "casey@example.com",
      primaryContactPhone: "555-0100",
      accessibilityNeeds: ["Step-free access"],
      serviceRequirements: "Servery",
      operationalRequirements: "Load via rear dock",
      assignedToId: "person-1",
      ownerName: "Robin",
      referralSourceId: "referral-1",
    });
    expect(full.venueName).toBe("Garden Hall");
    expect(full.venueCapacity).toBe(120);
    expect(full.accessibilityNeeds).toEqual(["Step-free access"]);
    expect(full.ownerName).toBe("Robin");

    const bare = EventDuplicatePlanning.planArgs({
      ...base,
      clientName: null,
      serviceStyleId: null,
      venueName: undefined,
      accessibilityNeeds: [],
    });
    expect("clientName" in bare).toBe(false);
    expect("serviceStyleId" in bare).toBe(false);
    expect("venueName" in bare).toBe(false);
    expect("accessibilityNeeds" in bare).toBe(false);
  });

  it("never carries lifecycle fields into the plan", () => {
    const source = {
      ...base,
      archivedAt: 123,
      stage: "approved",
      eventNumber: "EV-0001",
      importSourceKey: "import-1",
      approvedAt: 456,
    };
    const args = EventDuplicatePlanning.planArgs(source) as unknown as Record<
      string,
      unknown
    >;
    for (const forbidden of [
      "archivedAt",
      "stage",
      "eventNumber",
      "importSourceKey",
      "approvedAt",
      "archiveReason",
      "draftCapturedAt",
      "completedAt",
      "cancelledAt",
      "closedOutAt",
    ]) {
      expect(forbidden in args).toBe(false);
    }
  });
});
