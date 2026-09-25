import { describe, expect, it } from "vitest";
import {
  EVENT_READINESS_DOMAINS,
  type EventReadinessProjection,
} from "../../../convex/lib/eventReadinessProjection";
import {
  eventReadinessIssueLine,
  eventReadinessOpenCount,
  eventReadinessRows,
} from "../../../src/features/events/eventReadinessSummary";

const clean: EventReadinessProjection = {
  eventId: "ev-1",
  domains: EVENT_READINESS_DOMAINS.map((domain) => ({ domain, issues: [] })),
};

describe("eventReadinessSummary", () => {
  it("returns the nine domains in order with labels and empty issues on a clean projection", () => {
    const rows = eventReadinessRows(clean);
    expect(rows.map((row) => row.domain)).toEqual([...EVENT_READINESS_DOMAINS]);
    expect(rows.map((row) => row.label)).toEqual([
      "Commercial",
      "Planning",
      "Kitchen",
      "Purchasing",
      "Staffing",
      "Packing",
      "Packet",
      "Execution",
      "Closeout",
    ]);
    expect(rows.every((row) => row.issues.length === 0)).toBe(true);
  });

  it("returns no rows for null or undefined (loading / denied)", () => {
    expect(eventReadinessRows(null)).toEqual([]);
    expect(eventReadinessRows(undefined)).toEqual([]);
  });

  it("formats a commercial warning as reason · severity · resolvingAction", () => {
    expect(
      eventReadinessIssueLine({
        code: "commercial.quoted_price_missing",
        affectedIds: ["ev-1"],
        severity: "warning",
        reason: "This event has no quoted price to seed billing.",
        resolvingAction: "Event.changePricing",
      }),
    ).toBe(
      "This event has no quoted price to seed billing. · warning · Event.changePricing",
    );
  });

  it("counts open issues across all domains", () => {
    const projection: EventReadinessProjection = {
      eventId: "ev-1",
      domains: [
        {
          domain: "commercial",
          issues: [
            {
              code: "commercial.quoted_price_missing",
              affectedIds: ["ev-1"],
              severity: "warning",
              reason: "This event has no quoted price to seed billing.",
              resolvingAction: "Event.changePricing",
            },
          ],
        },
        {
          domain: "planning",
          issues: [
            {
              code: "planning.client_missing",
              affectedIds: ["ev-1"],
              severity: "warning",
              reason: "This event has no client yet.",
              resolvingAction: "Event.planEngagement",
            },
          ],
        },
      ],
    };
    expect(eventReadinessOpenCount(projection)).toBe(2);
    expect(eventReadinessOpenCount(clean)).toBe(0);
    expect(eventReadinessOpenCount(null)).toBe(0);
    expect(eventReadinessOpenCount(undefined)).toBe(0);
  });

  it("takes only the projection — there is no Event readiness field to read", () => {
    // The signatures accept only EventReadinessProjection | null | undefined,
    // so a stored-Event-shaped value cannot even be passed in. A projection
    // whose domains omit a domain still yields the full nine rows.
    const partial: EventReadinessProjection = {
      eventId: "ev-1",
      domains: [{ domain: "commercial", issues: [] }],
    };
    expect(eventReadinessRows(partial).map((row) => row.domain)).toEqual([
      ...EVENT_READINESS_DOMAINS,
    ]);
  });
});
