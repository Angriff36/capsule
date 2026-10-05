/**
 * AUTHOR SEAM — company timing rules applied to one event (spec §8.4,
 * PL-TIMING: AC-427, AC-428, AC-430).
 *
 * Reads the facts the rules need (booked service style, guest count, pack
 * list size, trucks on the event's deliveries) and the company rules, and
 * works out setup, load, briefing and safety buffer. applyEventTimingPolicy
 * writes them through the server-only Event.applyTimingPolicy step, only when
 * something differs, so a re-run with the same facts writes nothing. A setup
 * or load time a person typed is never replaced (the command keeps it).
 */
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  chooseLoadMinutes,
  policySetupMinutes,
  readTimingPolicy,
  type LoadChoice,
  type TimingPolicy,
} from "../../src/lib/eventTimingPolicy";
import { readRoutePolicy } from "../../src/lib/routeFacts";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

const FINISHED_STAGES = new Set(["completed", "closed_out", "cancelled"]);

export type EventTimingRulePlan = {
  policy: TimingPolicy;
  serviceStyleName: string | null;
  guestCount: number | null;
  packItemCount: number;
  vehicleCount: number;
  /** What the company rules give for this event. */
  setupMinutes: number | null;
  load: LoadChoice;
  briefingMinutes: number;
  safetyBufferMinutes: number;
};

/** The company rules worked out for one event of the caller's workspace. */
export async function readEventTimingRulePlan(
  ctx: QueryCtx,
  tenantId: string,
  event: Doc<"events">,
): Promise<EventTimingRulePlan> {
  const [organizations, packLists, deliveries] = await Promise.all([
    ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .collect(),
    ctx.db
      .query("packLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    ctx.db
      .query("deliveries")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
  ]);
  const organization =
    organizations.find((row) => row.deletedAt == null) ?? null;
  const policy = readTimingPolicy(organization);
  let serviceStyleName = event.serviceStyleName ?? null;
  if (!serviceStyleName && event.serviceStyleId) {
    const styleId = ctx.db.normalizeId(
      "serviceStyles",
      String(event.serviceStyleId),
    );
    const style = styleId ? await ctx.db.get(styleId) : null;
    if (style && style.tenantId === tenantId) serviceStyleName = style.name;
  }
  let packItemCount = 0;
  for (const list of packLists) {
    if (
      list.tenantId !== tenantId ||
      list.deletedAt != null ||
      list.status === "cancelled"
    )
      continue;
    const items = await ctx.db
      .query("packListItems")
      .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
      .collect();
    packItemCount += items.filter(
      (item) => item.tenantId === tenantId && item.deletedAt == null,
    ).length;
  }
  const vehicleCount = new Set(
    deliveries
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.deletedAt == null &&
          row.status !== "cancelled" &&
          row.vehicleId != null,
      )
      .map((row) => String(row.vehicleId)),
  ).size;
  const guestCount =
    typeof event.expectedHeadcount === "number" && event.expectedHeadcount > 0
      ? event.expectedHeadcount
      : null;
  return {
    policy,
    serviceStyleName,
    guestCount,
    packItemCount,
    vehicleCount,
    setupMinutes: policySetupMinutes(serviceStyleName, policy),
    load: chooseLoadMinutes(
      { serviceStyleName, guestCount, packItemCount, vehicleCount },
      policy,
    ),
    briefingMinutes: policy.briefingMinutes,
    safetyBufferMinutes: readRoutePolicy(organization).safetyBufferMinutes,
  };
}

const followsRule = (
  source: string | null | undefined,
  value: number | null | undefined,
) => source === "company_rule" || (source == null && value == null);

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * Applies the company rules to one event when anything they own differs.
 * Returns whether a write happened. Finished, cancelled or deleted events
 * keep their saved timing.
 */
export async function applyEventTimingPolicy(
  ctx: MutationCtx,
  tenantId: string,
  eventId: Id<"events">,
): Promise<boolean> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null)
    return false;
  if (FINISHED_STAGES.has(String(event.stage))) return false;
  const plan = await readEventTimingRulePlan(ctx, tenantId, event);
  const setupRule = followsRule(event.timingSetupSource, event.timingSetupMinutes);
  const loadRule = followsRule(event.timingLoadSource, event.timingLoadMinutes);
  const unchanged =
    (!setupRule || same(event.timingSetupMinutes, plan.setupMinutes)) &&
    (!loadRule ||
      (same(event.timingLoadMinutes, plan.load.minutes) &&
        same(event.timingLoadRuleId, plan.load.ruleId) &&
        same(event.timingLoadNeedsReview, plan.load.needsReview))) &&
    same(event.timingBriefingMinutes, plan.briefingMinutes) &&
    same(event.timingSafetyBufferMinutes, plan.safetyBufferMinutes);
  if (unchanged) return false;
  const system = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
  await system.runMutation(api.mutations.Event_applyTimingPolicy, {
    docId: eventId,
    ...(plan.setupMinutes != null ? { setupMinutes: plan.setupMinutes } : {}),
    loadMinutes: plan.load.minutes,
    ...(plan.load.ruleId != null ? { loadRuleId: plan.load.ruleId } : {}),
    loadNeedsReview: plan.load.needsReview,
    briefingMinutes: plan.briefingMinutes,
    safetyBufferMinutes: plan.safetyBufferMinutes,
  });
  return true;
}
