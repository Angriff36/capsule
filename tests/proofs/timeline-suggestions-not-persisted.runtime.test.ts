/**
 * Runtime proof (AC-490, PL-PREP, spec BE-11.2): the event timeline is worked
 * out only from the times a person or a company rule gave. A drive, cleanup,
 * return or unload time nobody gave stays unknown: no timeline time is made
 * up from it, and the 60-minute cleanup suggestion is never saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  blocksByMilestone,
  MIN,
  SERVE_AT,
  settle,
  stubTimingEnv,
  timingWorld,
} from "./timing-rules.runtime.helpers";

beforeEach(() => {
  stubTimingEnv();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("timeline suggestions are never saved (AC-490)", () => {
  it("calculating timeline milestones writes no suggested duration field", async () => {
    const { t, owner, event } = await timingWorld({
      policy: { briefingMinutes: 0, loadBaselineMinutes: 45 },
      safetyBufferMinutes: 0,
    });
    // Only the serve time and the setup time are given.
    await owner.mutation(api.mutations.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 120,
    });
    await settle(t);

    const saved = await owner.query(api.queries.getEvent, { id: event });
    // The suggestion is readable on screen...
    expect(saved.timingSuggestedCleanupMinutes).toBe(60);
    // ...but nothing nobody gave is saved.
    for (const field of [
      "timingOutboundTravelMinutes",
      "timingCleanupMinutes",
      "timingReturnTravelMinutes",
      "timingUnloadMinutes",
    ])
      expect(saved[field] ?? null, field).toBeNull();

    // Known: on site = serve - setup. Unknown legs stay unknown.
    expect(saved.timingOnsiteAt).toBe(SERVE_AT - 120 * MIN);
    for (const field of [
      "timingDepartShopAt",
      "timingLoadStartAt",
      "timingStaffOnAt",
      "timingDepartVenueAt",
      "timingReturnShopAt",
      "timingStaffOffAt",
    ])
      expect(saved[field] ?? null, field).toBeNull();

    // The stored event row carries no suggestion field at all, and the
    // company-rule times it does carry say they came from a rule.
    const raw = (await t.run(async (ctx) => ctx.db.get(event))) as Record<
      string,
      unknown
    >;
    expect(Object.keys(raw).filter((key) => /suggest/i.test(key))).toEqual([]);
    expect(raw.timingSetupSource).toBe("person");
    expect(raw.timingLoadSource).toBe("company_rule");

    // Timeline blocks exist only for times that are known.
    const blocks = await blocksByMilestone(t, event);
    expect(blocks.get("onsite_arrival")?.startsAt).toBe(SERVE_AT - 120 * MIN);
    for (const key of [
      "staff_on",
      "shop_departure",
      "venue_departure",
      "shop_return",
      "staff_off",
    ])
      expect(blocks.get(key)?.startsAt ?? null, key).toBeNull();

    // Running the rules again still saves no guess.
    await owner.mutation(api.mutations.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 120,
    });
    await settle(t);
    const again = (await t.run(async (ctx) => ctx.db.get(event))) as Record<
      string,
      unknown
    >;
    expect(again.timingCleanupMinutes ?? null).toBeNull();
    expect(again.timingOutboundTravelMinutes ?? null).toBeNull();
  });
});
