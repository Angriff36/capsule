// AUTHOR-OWNED - undo a candidate hire in ONE step (#269).
// Handles the linked team profile first (deactivate, or terminate for
// admins), then runs the governed Candidate.revokeHire so the candidate
// goes back to a working stage with the profile link cleared. A plain stage
// move on a hire with a profile is refused by the generated
// Candidate_advance constraint, so this seam is the only path.
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getAuthContext } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";

const WORKFORCE_MANAGE_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);
const ADMIN_ROLES = new Set(["admin", "owner", "system"]);
const REOPEN_STAGES = new Set([
  "application",
  "screening",
  "interview",
  "decision",
]);

export type HireRevocationResult = {
  toStage: string;
  /** What happened to the linked team profile. */
  profile: "deactivated" | "terminated" | "already_inactive" | "none";
};

export const revokeHire = mutation({
  args: {
    candidateId: v.id("candidates"),
    toStage: v.string(),
    // deactivate: profile can come back (default). terminate: admin-only,
    // permanent exit from the roster.
    profileAction: v.optional(
      v.union(v.literal("deactivate"), v.literal("terminate")),
    ),
    reason: v.optional(v.string()),
    expectedVersion: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { candidateId, toStage, profileAction, reason, expectedVersion },
  ): Promise<HireRevocationResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !WORKFORCE_MANAGE_ROLES.has(auth.role)) {
      throw new ConvexError("Only a workforce manager can revoke a hire.");
    }
    if (
      orgCapabilityDeniesAction(
        "workforceManageAccess",
        auth.disabledCapabilities,
      )
    ) {
      throw new ConvexError(
        "Workforce is switched off for this organization. Turn it back on under Administration → Permissions.",
      );
    }
    if (!REOPEN_STAGES.has(toStage)) {
      throw new ConvexError("Pick the stage the candidate goes back to.");
    }
    const candidate = await ctx.db.get(candidateId);
    if (
      !candidate ||
      candidate.deletedAt != null ||
      candidate.tenantId !== auth.tenantId
    ) {
      throw new ConvexError("Candidate not found.");
    }
    if (candidate.stage !== "hired") {
      throw new ConvexError(
        "Only a hired candidate can have the hire revoked.",
      );
    }
    if (
      expectedVersion !== undefined &&
      candidate.version !== expectedVersion
    ) {
      throw new ConvexError(
        "This candidate changed since you loaded the page. Refresh and try again.",
      );
    }

    const action = profileAction ?? "deactivate";
    if (action === "terminate" && !ADMIN_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Only an admin can terminate a team profile. Deactivate it instead, or ask an admin.",
      );
    }

    let profile: HireRevocationResult["profile"] = "none";
    const personId = candidate.hiredPersonId as Id<"people"> | undefined;
    const person = personId ? await ctx.db.get(personId) : null;
    if (
      person &&
      person.deletedAt == null &&
      person.tenantId === auth.tenantId
    ) {
      // Same escalation as linkAccount: touching an admin's access is admin-only.
      if (ADMIN_ROLES.has(String(person.role)) && !ADMIN_ROLES.has(auth.role)) {
        throw new ConvexError(
          "This hire holds an admin profile. Only an admin can revoke it.",
        );
      }
      const status = String(person.status);
      if (action === "terminate" && status !== "terminated") {
        await ctx.runMutation(api.mutations.Person_terminate, {
          docId: person._id,
          reason: reason ?? "Hire revoked",
          version: person.version,
        });
        profile = "terminated";
      } else if (status === "active") {
        await ctx.runMutation(api.mutations.Person_deactivate, {
          docId: person._id,
          version: person.version,
        });
        profile = "deactivated";
      } else {
        profile = "already_inactive";
      }
    }

    await ctx.runMutation(api.mutations.Candidate_revokeHire, {
      docId: candidateId,
      toStage,
      ...(reason ? { reason } : {}),
      version: candidate.version,
    });

    return { toStage, profile };
  },
});
