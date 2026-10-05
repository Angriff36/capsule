/**
 * Runtime proof (AC-428, PL-TIMING, spec §8.4 defaults and rules). Setup
 * before serve follows the company rule for the service style (full service
 * 180, limited 90, both company settings). A person may use their own value;
 * the event keeps it with the reason and who did it, and shows it next to
 * what the rule gives. Load time comes from the first matching company load
 * rule (style, guest count, pack list size, trucks); when none matches, the
 * standard load time is used and marked for a look.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import {
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

const M = api.mutations;

describe("setup and load policies (AC-428)", () => {
  it("tenant policy drives defaults; limited service uses its own rule", async () => {
    const full = await timingWorld();
    await settle(full.t);
    let saved = await full.owner.query(api.queries.getEvent, {
      id: full.event,
    });
    expect(saved.timingSetupMinutes).toBe(180);
    expect(saved.timingSetupSource).toBe("company_rule");

    // The company changes its full service rule: open events follow.
    await full.owner.mutation(M.Organization_configureTimingPolicy, {
      docId: full.organization,
      fullServiceSetupMinutes: 150,
      limitedServiceSetupMinutes: 75,
      briefingMinutes: 10,
      loadBaselineMinutes: 60,
    });
    await settle(full.t);
    saved = await full.owner.query(api.queries.getEvent, { id: full.event });
    expect(saved.timingSetupMinutes).toBe(150);
    expect(saved.timingBriefingMinutes).toBe(10);

    const limited = await timingWorld({ style: "Limited Service" });
    await settle(limited.t);
    const other = await limited.owner.query(api.queries.getEvent, {
      id: limited.event,
    });
    expect(other.timingSetupMinutes).toBe(90);
  });

  it("event override records reason and person, and the rule no longer moves it", async () => {
    const { t, owner, plannerActor, plannerId, organization, event } =
      await timingWorld();
    await settle(t);
    await plannerActor.mutation(M.Event_configureTiming, {
      docId: event,
      serviceStartsAt: SERVE_AT,
      setupMinutes: 210,
      loadMinutes: 60,
      setupOverrideReason: "Tent goes up on site",
    });
    await settle(t);
    let saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingSetupMinutes).toBe(210);
    expect(saved.timingSetupSource).toBe("person");
    expect(saved.timingSetupOverrideReason).toBe("Tent goes up on site");
    expect(saved.timingSetupOverrideByPersonId).toBe(plannerId);
    expect(saved.timingSetupOverrideAt).toEqual(expect.any(Number));

    // A new company rule does not move the person's value.
    await owner.mutation(M.Organization_configureTimingPolicy, {
      docId: organization,
      fullServiceSetupMinutes: 160,
      limitedServiceSetupMinutes: 90,
      briefingMinutes: 0,
      loadBaselineMinutes: 60,
    });
    await settle(t);
    saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingSetupMinutes).toBe(210);

    // The event shows the calculated value next to the person's value.
    const rules = await owner.query(api.eventTimingRules.getEventTimingRules, {
      eventId: event,
    });
    expect(rules!.setup).toMatchObject({
      minutes: 210,
      ruleMinutes: 160,
      source: "person",
      overrideReason: "Tent goes up on site",
      overrideBy: "Casey Planner",
    });

    // Handing it back to the rule clears the reason and applies 160.
    await plannerActor.mutation(M.Event_useCompanyTimingRule, {
      docId: event,
      setup: true,
      load: false,
    });
    await settle(t);
    saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingSetupMinutes).toBe(160);
    expect(saved.timingSetupSource).toBe("company_rule");
    expect(saved.timingSetupOverrideReason ?? null).toBeNull();
  });

  it("load comes from the matching rule; no match uses the standard time marked for review", async () => {
    const { t, owner, event } = await timingWorld({
      headcount: 120,
      policy: {
        loadBaselineMinutes: 60,
        loadRules: [
          {
            id: "big-full",
            label: "Big full service",
            serviceStyle: "Full Service",
            minGuests: 200,
            minutes: 90,
          },
          {
            id: "long-pack",
            label: "Long pack list",
            minPackItems: 2,
            minutes: 75,
          },
        ],
      },
    });
    await settle(t);
    let saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingLoadMinutes).toBe(60);
    expect(saved.timingLoadSource).toBe("company_rule");
    expect(saved.timingLoadRuleId ?? null).toBeNull();
    expect(saved.timingLoadNeedsReview).toBe(true);

    // A bigger guest count matches the big full service rule.
    await owner.mutation(M.Event_changeHeadcount, {
      docId: event,
      newHeadcount: 250,
    });
    await settle(t);
    saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingLoadMinutes).toBe(90);
    expect(saved.timingLoadRuleId).toBe("big-full");
    expect(saved.timingLoadNeedsReview).toBe(false);
    const rules = await owner.query(api.eventTimingRules.getEventTimingRules, {
      eventId: event,
    });
    expect(rules!.load).toMatchObject({
      minutes: 90,
      ruleLabel: "Big full service",
      needsReview: false,
    });

    // Back to 120 guests, then a longer pack list matches the pack rule.
    await owner.mutation(M.Event_changeHeadcount, {
      docId: event,
      newHeadcount: 120,
    });
    const list = (await owner.mutation(M.PackList_createViaOpen, {
      eventId: event,
      name: "Main pack",
    })) as { docId: string };
    for (const description of ["Chafers", "Linens"]) {
      await owner.mutation(M.PackListItem_createViaAddItem, {
        packListId: list.docId,
        description,
        requiredQuantity: 4,
        unit: "each",
      });
    }
    await settle(t);
    saved = await owner.query(api.queries.getEvent, { id: event });
    expect(saved.timingLoadMinutes).toBe(75);
    expect(saved.timingLoadRuleId).toBe("long-pack");
  });
});
