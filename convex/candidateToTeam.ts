// AUTHOR SEAM — hire a candidate into the team: Person row + sign-in handoff.
//
// /staff/hiring tracked the recruiting decision only: Candidate_hire flipped a
// stage and nothing else — no Person, no role, no login. The CandidateHired
// event has no consumer, so the accepted offer dead-ended at a label. This
// seam is the missing wire: it creates the Person through the SAME generated
// command the Team roles hire form uses (Person_createViaHire — unique email,
// encrypted at rest, hireDate stamped) and links it on the candidate row via
// Candidate_hire. The CLIENT then calls authProvision.provisionStaffSignIn
// with the returned personId to create the Clerk account and email the
// password — that step stays client-orchestrated because it is an action
// (Clerk REST + mail) and actions cannot run inside a mutation.
//
// Gated at the workforceManageAccess tier, the EXACT roles base.manifest
// grants it (workforce_manager/admin/owner/system via `extends`), the same
// mirror hiringPipeline.ts keeps in sync with base.manifest.
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import type { Id } from "./_generated/dataModel";

const WORKFORCE_MANAGE_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

export type HireIntoTeamResult =
  // Person created (or already linked) and the candidate row now points at
  // it — the client sends the sign-in email to personId next.
  | { kind: "hired"; personId: string; email: string }
  // Candidate had no email, so no Person could be made. The stage mark still
  // commits — the UI says to add them under Team roles with an email.
  | { kind: "hired_no_email" };

export const hireIntoTeam = mutation({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, { candidateId }): Promise<HireIntoTeamResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !WORKFORCE_MANAGE_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Only a workforce manager can hire a candidate into the team.",
      );
    }
    const candidate = await ctx.db.get(candidateId);
    if (
      !candidate ||
      candidate.deletedAt != null ||
      candidate.tenantId !== auth.tenantId
    ) {
      throw new ConvexError("Candidate not found.");
    }

    // Person.email is required and encrypted — a sign-in cannot exist without
    // it. Record the recruiting decision and hand the fix to the Team roles
    // form instead of blocking the hire.
    const email = (candidate.email ?? "").trim().toLowerCase();
    if (!email) {
      await ctx.runMutation(api.mutations.Candidate_hire, {
        docId: candidateId,
        version: candidate.version,
      });
      return { kind: "hired_no_email" };
    }

    // Idempotent: a re-run after a partial success returns the linked Person
    // instead of tripping Person's unique-email guard with a duplicate hire.
    if (candidate.stage === "hired") {
      if (candidate.hiredPersonId) {
        const linked = await ctx.db.get(
          candidate.hiredPersonId as Id<"people">,
        );
        if (linked && linked.deletedAt == null) {
          return {
            kind: "hired",
            personId: String(linked._id),
            email,
          };
        }
      }
      throw new ConvexError(
        "This candidate is already hired but their team profile is gone. Hire them again under Team roles.",
      );
    }

    const fullName = candidate.fullName.trim();
    const parts = fullName.split(/\s+/u);
    const givenName = parts[0] ?? "";
    const familyName = parts.length > 1 ? parts.slice(1).join(" ") : givenName;
    if (!givenName) {
      throw new ConvexError("Candidate has no name to hire with.");
    }

    const result = await ctx.runMutation(api.mutations.Person_createViaHire, {
      givenName,
      familyName,
      email,
      role: candidate.roleAppliedFor,
      idempotencyKey: `candidateHire:${auth.tenantId}:${candidateId}`,
    });
    const personId = result.docId as Id<"people">;

    await ctx.runMutation(api.mutations.Candidate_hire, {
      docId: candidateId,
      version: candidate.version,
      hiredPersonId: personId,
    });

    return { kind: "hired", personId: String(personId), email };
  },
});
