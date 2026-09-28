/**
 * Shared setup for the PL-TIMING proofs (AC-427, AC-428, AC-430): a company
 * with timing and drive-time rules, a service style, a planner who is a real
 * staff person, and an event whose timing the company rules fill in.
 */
import { convexTest } from "convex-test";
import { vi } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

export const TIMING_TENANT = "tenant-timing-rules";
export const SERVE_AT = Date.UTC(2030, 6, 18, 23, 0);
export const ENDS_AT = Date.UTC(2030, 6, 19, 3, 0);
export const MIN = 60_000;

export function stubTimingEnv() {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    vi.stubEnv(
      "CONVEX_FIELD_ENCRYPTION_KEY",
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=",
    );
  }
}

export type TimingWorldOptions = {
  style?: string;
  headcount?: number;
  policy?: {
    fullServiceSetupMinutes?: number;
    limitedServiceSetupMinutes?: number;
    briefingMinutes?: number;
    loadBaselineMinutes?: number;
    loadRules?: unknown[];
  } | null;
  safetyBufferMinutes?: number;
};

export async function timingWorld(options: TimingWorldOptions = {}) {
  const t = convexTest(schema, modules);
  const owner = t.withIdentity({
    subject: "timing-owner",
    org_id: TIMING_TENANT,
    role: "owner",
  });
  const M = api.mutations;
  const planner = (await owner.mutation(M.Person_createViaHire, {
    givenName: "Casey",
    familyName: "Planner",
    email: "casey.planner@proof.example",
    role: "event_manager",
    employmentType: "full_time",
    authSubjectId: "timing-planner",
  })) as { docId: Id<"people"> };
  const plannerActor = t.withIdentity({
    subject: "timing-planner",
    org_id: TIMING_TENANT,
    role: "event_manager",
  });
  const organization = (await owner.mutation(M.Organization_createViaRegister, {
    name: "Timing Proof Catering",
  })) as { docId: Id<"organizations"> };
  if (options.policy !== null) {
    const policy = options.policy ?? {};
    await owner.mutation(M.Organization_configureTimingPolicy, {
      docId: organization.docId,
      fullServiceSetupMinutes: policy.fullServiceSetupMinutes ?? 180,
      limitedServiceSetupMinutes: policy.limitedServiceSetupMinutes ?? 90,
      briefingMinutes: policy.briefingMinutes ?? 0,
      loadBaselineMinutes: policy.loadBaselineMinutes ?? 60,
      ...(policy.loadRules
        ? { loadRulesJson: JSON.stringify(policy.loadRules) }
        : {}),
    });
  }
  await owner.mutation(M.Organization_configureRoutePolicy, {
    docId: organization.docId,
    safetyBufferMinutes: options.safetyBufferMinutes ?? 15,
    trafficPolicy: "traffic_aware",
    refreshHours: 24,
  });
  const style = (await owner.mutation(M.ServiceStyle_createViaRegister, {
    name: options.style ?? "Full Service",
    code: (options.style ?? "Full Service").toUpperCase().replace(/\s+/g, "_"),
    sortOrder: 10,
  })) as { docId: Id<"serviceStyles"> };
  const client = (await owner.mutation(M.Client_createViaRegister, {
    clientType: "company",
    companyName: "Timing Proof Co",
  })) as { docId: string };
  const event = (await owner.mutation(M.Event_createViaPlanEngagement, {
    clientId: client.docId,
    title: "Timing proof gala",
    eventType: "catering",
    startsAt: SERVE_AT,
    endsAt: ENDS_AT,
    expectedHeadcount: options.headcount ?? 120,
    primaryContactName: "Pat Planner",
    budgetAmount: 6000,
    quotedPrice: 6000,
    serviceStyleId: style.docId,
    venueName: "Harbor Hall",
    venueAddress: "1 Harbor Way, Portland ME, US",
  })) as { docId: Id<"events"> };
  return {
    t,
    owner,
    plannerActor,
    plannerId: planner.docId,
    organization: organization.docId,
    style: style.docId,
    event: event.docId,
  };
}

export type TimingTest = Awaited<ReturnType<typeof timingWorld>>["t"];

/** Runs every queued follow-up (timing re-plans) to the end. The test turns
 * on fake timers before it builds the world. */
export async function settle(t: TimingTest) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

/** Planned timeline blocks by milestone key. */
export async function blocksByMilestone(t: TimingTest, eventId: Id<"events">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("eventTimelineActivities")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  );
  return new Map(
    rows
      .filter((row) => row.deletedAt == null && row.timingMilestone != null)
      .map((row) => [String(row.timingMilestone), row]),
  );
}
