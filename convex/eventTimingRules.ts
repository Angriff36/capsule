/**
 * AUTHOR SEAM — company event timing rules (spec §8.4, PL-TIMING).
 *
 * recalculate re-applies the company rules to one event after a change that
 * can move them (queued by convex/lib/timingFollowUp.ts); recalculateCompany
 * does it for every open event after the company rules change.
 * getEventTimingRules shows, for the timing screen, what the rules give next
 * to what the event uses, and who changed a value by hand and why.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  applyEventTimingPolicy,
  readEventTimingRulePlan,
} from "./lib/eventTimingPolicy";

const FINISHED_STAGES = new Set(["completed", "closed_out", "cancelled"]);
const OPEN_STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
] as const;
const DAY_MS = 24 * 3_600_000;

export const recalculate = internalMutation({
  args: { tenantId: v.string(), eventId: v.id("events") },
  handler: async (ctx, { tenantId, eventId }) => ({
    applied: await applyEventTimingPolicy(ctx, tenantId, eventId),
  }),
});

/** Every open event that has not already happened follows new company rules. */
export const recalculateCompany = internalMutation({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const now = Date.now();
    // Open stages only, through the stage index — never the finished
    // event history.
    const events = (
      await Promise.all(
        OPEN_STAGES.map((stage) =>
          ctx.db
            .query("events")
            .withIndex("by_tenantId_and_stage_and_startsAt", (q) =>
              q.eq("tenantId", tenantId).eq("stage", stage),
            )
            .collect(),
        ),
      )
    ).flat();
    let queued = 0;
    for (const event of events) {
      if (event.deletedAt != null || FINISHED_STAGES.has(String(event.stage)))
        continue;
      if (typeof event.startsAt === "number" && event.startsAt < now - DAY_MS)
        continue;
      await ctx.scheduler.runAfter(0, internal.eventTimingRules.recalculate, {
        tenantId,
        eventId: event._id,
      });
      queued++;
    }
    return { queued };
  },
});

type TimingPart = {
  /** What the event uses now. */
  minutes: number | null;
  /** What the company rules give. */
  ruleMinutes: number | null;
  source: "company_rule" | "person" | null;
  overrideReason: string | null;
  overrideBy: string | null;
  overrideAt: number | null;
};

export type EventTimingRules = {
  serviceStyleName: string | null;
  guestCount: number | null;
  packItemCount: number;
  vehicleCount: number;
  setup: TimingPart;
  load: TimingPart & {
    ruleLabel: string | null;
    /** No load rule matched: the standard load time is used; check it. */
    needsReview: boolean;
  };
  briefingMinutes: number;
  safetyBufferMinutes: number;
};

/** The timing screen: any signed-in staff member of the workspace. */
export const getEventTimingRules = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }): Promise<EventTimingRules | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("events", eventId);
    const event = id ? await ctx.db.get(id) : null;
    if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
      return null;
    const plan = await readEventTimingRulePlan(ctx, auth.tenantId, event);
    const personName = async (personId: unknown) => {
      const pid =
        typeof personId === "string"
          ? ctx.db.normalizeId("people", personId)
          : null;
      const person = pid ? await ctx.db.get(pid as Id<"people">) : null;
      if (!person || person.tenantId !== auth.tenantId) return null;
      return `${person.givenName} ${person.familyName}`.trim() || null;
    };
    const source = (value: unknown) =>
      value === "company_rule" || value === "person" ? value : null;
    const loadByRule = source(event.timingLoadSource) === "company_rule";
    return {
      serviceStyleName: plan.serviceStyleName,
      guestCount: plan.guestCount,
      packItemCount: plan.packItemCount,
      vehicleCount: plan.vehicleCount,
      setup: {
        minutes: event.timingSetupMinutes ?? null,
        ruleMinutes: plan.setupMinutes,
        source: source(event.timingSetupSource),
        overrideReason: event.timingSetupOverrideReason ?? null,
        overrideBy: await personName(event.timingSetupOverrideByPersonId),
        overrideAt: event.timingSetupOverrideAt ?? null,
      },
      load: {
        minutes: event.timingLoadMinutes ?? null,
        ruleMinutes: plan.load.minutes,
        source: source(event.timingLoadSource),
        overrideReason: event.timingLoadOverrideReason ?? null,
        overrideBy: await personName(event.timingLoadOverrideByPersonId),
        overrideAt: event.timingLoadOverrideAt ?? null,
        ruleLabel: plan.load.ruleLabel,
        needsReview: loadByRule && event.timingLoadNeedsReview === true,
      },
      briefingMinutes: event.timingBriefingMinutes ?? plan.briefingMinutes,
      safetyBufferMinutes:
        event.timingSafetyBufferMinutes ?? plan.safetyBufferMinutes,
    };
  },
});
