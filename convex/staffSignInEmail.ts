// AUTHOR-OWNED — the saved record of each sign-in email Capsule asked the
// sign-in service to send. A failed or lost send stays visible on the team
// row ("not sent - email sign-in again") instead of living only in a notice
// the manager may have closed. The record holds no email address and no
// provider message; only the outcome, a safe error class and who asked.
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  classifyDeliveryError,
  deliveryErrorLabel,
  summarizeDelivery,
  type DeliveryAttemptRow,
  type DeliveryErrorClass,
  type DeliveryState,
} from "./lib/deliveryState";
import { ClerkStaffAccountError } from "./lib/clerkStaffAccount";
import { insertStepEvent } from "./lib/commandAudit";

const ENTITY = "StaffSignInEmail";
const CAN_SEE = new Set(["admin", "owner", "system", "workforce_manager"]);

/** A safe class for a failed send; never the provider's own words. */
export function signInEmailErrorClass(error: unknown): DeliveryErrorClass {
  if (error instanceof ClerkStaffAccountError) {
    return classifyDeliveryError({ httpStatus: error.httpStatus ?? null });
  }
  if (
    error instanceof Error &&
    error.message === "The sign-in service could not be reached."
  ) {
    return "network";
  }
  return "unknown";
}

export const recordSignInEmail = internalMutation({
  args: {
    tenantId: v.string(),
    personId: v.id("people"),
    attemptId: v.string(),
    outcome: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed"),
    ),
    errorClass: v.optional(v.string()),
    requestedBy: v.string(),
  },
  handler: async (ctx, args) => {
    await insertStepEvent(ctx, {
      type:
        args.outcome === "started"
          ? "StaffSignInEmailStarted"
          : args.outcome === "succeeded"
            ? "StaffSignInEmailSent"
            : "StaffSignInEmailFailed",
      entity: ENTITY,
      entityId: String(args.personId),
      payload: {
        tenantId: args.tenantId,
        personId: String(args.personId),
        attemptId: args.attemptId,
        outcome: args.outcome,
        ...(args.errorClass ? { errorClass: args.errorClass } : {}),
        requestedBy: args.requestedBy,
      },
      createdAt: Date.now(),
    });
  },
});

export interface SignInEmailStateView {
  personId: string;
  state: DeliveryState;
  attemptCount: number;
  lastAttemptAt: number | null;
  problem: string | null;
}

/** The newest sign-in email state per person in one workspace. */
export function signInEmailStates(
  rows: ReadonlyArray<{ payload: unknown; createdAt: number }>,
  tenantId: string,
  now: number,
): SignInEmailStateView[] {
  const byPerson = new Map<string, DeliveryAttemptRow[]>();
  for (const row of rows) {
    const payload = row.payload as Record<string, unknown>;
    if (payload?.tenantId !== tenantId) continue;
    const personId = String(payload.personId ?? "");
    const outcome = payload.outcome;
    if (
      !personId ||
      (outcome !== "started" && outcome !== "succeeded" && outcome !== "failed")
    ) {
      continue;
    }
    const list = byPerson.get(personId) ?? [];
    // Each send is one new try: an earlier send's result does not count
    // for this one, so only the newest try decides the state.
    if (outcome === "started") list.length = 0;
    list.push({
      outcome,
      at: row.createdAt,
      errorClass:
        outcome === "failed"
          ? ((payload.errorClass as DeliveryErrorClass | undefined) ??
            "unknown")
          : null,
    });
    byPerson.set(personId, list);
  }
  return [...byPerson.entries()].map(([personId, list]) => {
    const summary = summarizeDelivery(list, now, {
      maxAttempts: 1,
      baseDelayMs: 0,
      maxDelayMs: 0,
      leaseMs: 5 * 60_000,
    });
    return {
      personId,
      state: summary.state,
      attemptCount: summary.attemptCount,
      lastAttemptAt: list.at(-1)?.at ?? null,
      problem: summary.errorClass
        ? deliveryErrorLabel(summary.errorClass)
        : null,
    };
  });
}

/** The newest sign-in email state per person, for managers who can send one. */
export const listSignInEmailStates = query({
  args: {},
  handler: async (ctx): Promise<SignInEmailStateView[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !CAN_SEE.has(auth.role)) return [];
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entity", (q) => q.eq("entity", ENTITY))
      .collect();
    return signInEmailStates(rows, auth.tenantId, Date.now());
  },
});
