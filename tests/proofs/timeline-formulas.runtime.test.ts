/**
 * Runtime proof (AC-427, PL-TIMING, spec §8.4 formulas). Way out:
 * on-site = serve - setup; shop departure = on-site - drive - safety buffer;
 * load start = departure - load; staff on = load start - briefing. Way back:
 * venue departure = end + cleanup; back at the shop = + drive; staff off =
 * + unload. Setup, load, briefing and buffer come from the company rules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  blocksByMilestone,
  ENDS_AT,
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

describe("timeline formulas (AC-427)", () => {
  it("each §8.4 formula holds including buffer and briefing-lead terms", async () => {
    const { t, owner, event } = await timingWorld({
      policy: { briefingMinutes: 20, loadBaselineMinutes: 45 },
      safetyBufferMinutes: 15,
    });
    // The person enters serve time and the drive and cleanup durations only;
    // setup, load, briefing and buffer come from the company rules.
    await owner.mutation(api.mutations.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      outboundTravelMinutes: 40,
      cleanupMinutes: 60,
      returnTravelMinutes: 45,
      unloadMinutes: 30,
    });
    await settle(t);

    const saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingSetupMinutes).toBe(180);
    expect(saved.timingSetupSource).toBe("company_rule");
    expect(saved.timingLoadMinutes).toBe(45);
    expect(saved.timingBriefingMinutes).toBe(20);
    expect(saved.timingSafetyBufferMinutes).toBe(15);

    const onsite = SERVE_AT - 180 * MIN;
    const departShop = onsite - (40 + 15) * MIN;
    const loadStart = departShop - 45 * MIN;
    const staffOn = loadStart - 20 * MIN;
    const departVenue = ENDS_AT + 60 * MIN;
    const backAtShop = departVenue + 45 * MIN;
    const staffOff = backAtShop + 30 * MIN;
    expect(saved.timingOnsiteAt).toBe(onsite);
    expect(saved.timingDepartShopAt).toBe(departShop);
    expect(saved.timingLoadStartAt).toBe(loadStart);
    expect(saved.timingStaffOnAt).toBe(staffOn);
    expect(saved.timingDepartVenueAt).toBe(departVenue);
    expect(saved.timingReturnShopAt).toBe(backAtShop);
    expect(saved.timingStaffOffAt).toBe(staffOff);

    // The timeline blocks carry the same times.
    const blocks = await blocksByMilestone(t, event);
    expect(blocks.get("staff_on")?.startsAt).toBe(staffOn);
    expect(blocks.get("staff_on")?.endsAt).toBe(departShop);
    expect(blocks.get("shop_departure")?.startsAt).toBe(departShop);
    expect(blocks.get("onsite_arrival")?.startsAt).toBe(onsite);
    expect(blocks.get("venue_departure")?.startsAt).toBe(departVenue);
    expect(blocks.get("shop_return")?.startsAt).toBe(backAtShop);
    expect(blocks.get("staff_off")?.startsAt).toBe(staffOff);
  });

  it("no briefing and no buffer leave the old sums unchanged", async () => {
    const { t, owner, event } = await timingWorld({
      policy: { briefingMinutes: 0 },
      safetyBufferMinutes: 0,
    });
    await owner.mutation(api.mutations.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 120,
      loadMinutes: 60,
      outboundTravelMinutes: 30,
    });
    await settle(t);
    const saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingSetupMinutes).toBe(120);
    expect(saved.timingSetupSource).toBe("person");
    const onsite = SERVE_AT - 120 * MIN;
    expect(saved.timingDepartShopAt).toBe(onsite - 30 * MIN);
    expect(saved.timingStaffOnAt).toBe(onsite - 90 * MIN);
  });
});
