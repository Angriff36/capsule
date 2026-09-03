// AUTHOR SEAM — hire a candidate into the team: Person row + sign-in handoff.
//
// /staff/hiring tracked the recruiting decision only: Candidate_hire flipped a
// stage and nothing else — no Person, no role, no login. The CandidateHired
// event has no consumer, so the accepted offer dead-ended at a label. This
// seam is the missing wire: it creates the Person through the SAME generated
// command the Team roles hire form uses (Person_createViaHire — encrypted at
// rest, hireDate stamped) and links it on the candidate row. The CLIENT then
// calls authProvision.provisionStaffSignIn with the returned personId to
// create the Clerk account and email the password — that step stays
// client-orchestrated because it is an action (Clerk REST + mail) and actions
// cannot run inside a mutation.
//
// Candidates already marked hired WITHOUT a linked profile — the old button's
// output and KM imports with a hired stage — are converted here too:
// Candidate_hire refuses stage "hired", so the link is a direct patch, the
// same direct-write shape hiringPipeline.ts uses for its upserts, behind the
// same role gate.
//
// The generated create command does a plain insert: the manifest's
// `unique [tenantId, email]` is NOT enforced at the DB, so this seam resolves
// an existing Person by decrypted email BEFORE creating and links to it
// instead of minting a duplicate.
//
// Gated at the workforceManageAccess tier, the EXACT roles base.manifest
// grants it (workforce_manager/admin/owner/system via `extends`), the same
// mirror hiringPipeline.ts keeps in sync with base.manifest.
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";
import { decrypt } from "./lib/encryption";
import type { Doc, Id } from "./_generated/dataModel";

const WORKFORCE_MANAGE_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

// Roles that carry decision authority over other people or domains. Hiring a
// candidate INTO one of these is a role assignment, and role assignment is
// admin-only in Capsule (Person.assignRole). A workforce manager can hire the
// line, not grant a manager tier — mirrors the assignRole/linkAccount
// escalation guards. Keep in sync with base.manifest.
const PRIVILEGED_HIRE_ROLES = new Set([
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

export type HireIntoTeamResult =
  // Person created (or already linked) and the candidate row now points at
  // it — the client sends the sign-in email to personId next.
  | { kind: "hired"; personId: string; email: string }
  // Candidate had no usable email, so no Person could be made. The stage mark
  // still commits — the UI says to add them under Team roles with an email.
  | { kind: "hired_no_email" };

export const hireIntoTeam = mutation({
  args: {
    candidateId: v.id("candidates"),
    // Optimistic concurrency, same as the generated commands: refuse to hire
    // over a row another manager (or a KM re-import) changed since render.
    expectedVersion: v.optional(v.number()),
  },
  handler: async (
    ctx,
    { candidateId, expectedVersion },
  ): Promise<HireIntoTeamResult> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !WORKFORCE_MANAGE_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Only a workforce manager can hire a candidate into the team.",
      );
    }
    // The manual role mirror above bypasses the generated checkRole, so it
    // must also fail closed on the org-wide Workforce kill-switch.
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
    const candidate = await ctx.db.get(candidateId);
    if (
      !candidate ||
      candidate.deletedAt != null ||
      candidate.tenantId !== auth.tenantId
    ) {
      throw new ConvexError("Candidate not found.");
    }
    const alreadyHired = candidate.stage === "hired";

    // Idempotent resume BEFORE the version check: if the hire already
    // committed and the profile is linked, a re-run (e.g. the caller lost
    // the response before provisioning) must not be blocked by the stale
    // version — return the personId and let the client finish the email. A
    // stale CONCURRENT hire is payload-indistinguishable from that retry;
    // both end in the same place, and provisionStaffSignIn re-issues the
    // password until the person first signs in (its own documented recovery
    // behavior — the same as re-pressing "Email sign-in" in Team roles).
    if (alreadyHired && candidate.hiredPersonId) {
      const linked = await ctx.db.get(candidate.hiredPersonId as Id<"people">);
      if (linked && linked.deletedAt == null) {
        // A linked profile that was later deactivated cannot receive a
        // sign-in (provisionStaffSignIn requires an active row) — bring it
        // back first, under the same privileged-role gate as the reuse path.
        if (String(linked.status) === "inactive") {
          if (
            PRIVILEGED_HIRE_ROLES.has(String(linked.role)) &&
            !ADMIN_ROLES.has(auth.role)
          ) {
            throw new ConvexError(
              "This hire's profile is an inactive manager or admin. Only an admin can bring that profile back — sort it out under Team roles.",
            );
          }
          await ctx.runMutation(api.mutations.Person_reactivate, {
            docId: linked._id,
            version: linked.version,
          });
        }
        return {
          kind: "hired",
          personId: String(linked._id),
          email: normalized(candidate.email),
        };
      }
    }

    if (
      expectedVersion !== undefined &&
      candidate.version !== expectedVersion
    ) {
      throw new ConvexError(
        "This candidate changed since you loaded the page. Refresh and try again.",
      );
    }

    // Person.email is required and Clerk needs a deliverable address — a
    // sign-in cannot exist without one. Record the recruiting decision and
    // hand the fix to the Team roles form instead of blocking the hire.
    const email = normalized(candidate.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      if (!alreadyHired) {
        await ctx.runMutation(api.mutations.Candidate_hire, {
          docId: candidateId,
          version: expectedVersion ?? candidate.version,
        });
      }
      return { kind: "hired_no_email" };
    }

    // Same email already on a profile? Link to it — never a duplicate.
    const existing = await findPersonByEmail(ctx, auth.tenantId, email);
    // Hiring into a privileged role — by creating a profile with one, OR by
    // reusing/reactivating an existing profile that HOLDS one — is a role
    // assignment, which Capsule makes admin-only (Person.assignRole). The
    // candidate keeps a privileged roleAppliedFor on their row; an admin can
    // set it under Team roles after the hire.
    const effectiveRole = existing
      ? String(existing.role)
      : candidate.roleAppliedFor;
    if (
      PRIVILEGED_HIRE_ROLES.has(effectiveRole) &&
      !ADMIN_ROLES.has(auth.role)
    ) {
      throw new ConvexError(
        existing
          ? "This email belongs to an inactive manager or admin. Only an admin can bring that profile back — sort it out under Team roles."
          : "Hiring into a manager or admin role needs an admin. Hire them into their staff role, or have an admin change the role under Team roles.",
      );
    }
    let personId: Id<"people">;
    if (existing) {
      // Terminated is terminal (status transition terminated → []) and
      // terminate() soft-deletes the row, so it cannot be reused — blocking
      // beats minting a second identity on the same mailbox.
      if (String(existing.status) === "terminated") {
        throw new ConvexError(
          "This email belongs to a terminated team member. Sort out their profile under Team roles before hiring this candidate.",
        );
      }
      // Returning seasonal/inactive staff: reactivate their row instead of
      // splitting employment history across two profiles.
      if (String(existing.status) === "inactive") {
        await ctx.runMutation(api.mutations.Person_reactivate, {
          docId: existing._id,
          version: existing.version,
        });
      }
      personId = existing._id;
    } else {
      const fullName = candidate.fullName.trim();
      const parts = fullName.split(/\s+/u);
      const givenName = parts[0] ?? "";
      const familyName =
        parts.length > 1 ? parts.slice(1).join(" ") : givenName;
      if (!givenName) {
        throw new ConvexError("Candidate has no name to hire with.");
      }
      const result = await ctx.runMutation(api.mutations.Person_createViaHire, {
        givenName,
        familyName,
        email,
        phone: candidate.phone ?? undefined,
        role: candidate.roleAppliedFor,
        idempotencyKey: `candidateHire:${auth.tenantId}:${candidateId}`,
      });
      personId = result.docId as Id<"people">;
    }

    if (alreadyHired) {
      // Old-path hires (pre-feature button, KM imports) reached stage hired
      // with no Person and Candidate_hire refuses stage "hired" — link the
      // profile directly, the same direct patch hiringPipeline's upserts use.
      await ctx.db.patch(candidateId, {
        hiredPersonId: personId,
        updatedAt: Date.now(),
        version: (candidate.version ?? 0) + 1,
      });
    } else {
      await ctx.runMutation(api.mutations.Candidate_hire, {
        docId: candidateId,
        version: expectedVersion ?? candidate.version,
        hiredPersonId: personId,
      });
    }

    return { kind: "hired", personId: String(personId), email };
  },
});

function normalized(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * The tenant's Person carrying this email — ANY row, including terminated
 * ones, because terminate() sets deletedAt and a soft-deleted mailbox must
 * still block a duplicate. Precedence among matches: a live linked profile
 * first (its Clerk account already exists), then any other live row, then a
 * terminated one. Person.email is encrypted, so the only honest match is a
 * decrypt-and-compare over the tenant's roster — single-tenant scale, the
 * same shape as the roster scan the generated list query and authLink
 * already do.
 */
async function findPersonByEmail(
  ctx: MutationCtx,
  tenantId: string,
  email: string,
): Promise<Doc<"people"> | null> {
  const people = await ctx.db
    .query("people")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  let unlinked: Doc<"people"> | null = null;
  let terminated: Doc<"people"> | null = null;
  for (const person of people) {
    if ((await readStoredEmail(ctx, person.email)) !== email) continue;
    if (person.deletedAt != null || String(person.status) === "terminated") {
      terminated ??= person;
    } else if (person.authSubjectId) {
      return person;
    } else {
      unlinked ??= person;
    }
  }
  return unlinked ?? terminated;
}

/** Person.email is an encrypted field; decode the envelope, else take it raw. */
async function readStoredEmail(ctx: unknown, raw: unknown): Promise<string> {
  if (typeof raw !== "string") return "";
  let envelope: { v?: unknown; kid?: unknown; ct?: unknown } | null = null;
  try {
    envelope = JSON.parse(raw) as typeof envelope;
  } catch {
    envelope = null;
  }
  const encrypted =
    envelope !== null &&
    typeof envelope === "object" &&
    "v" in envelope &&
    "kid" in envelope &&
    "ct" in envelope;
  const plain = encrypted
    ? await decrypt(String(envelope!.ct), String(envelope!.kid), {
        ctx,
        entity: "Person",
        property: "email",
      })
    : raw;
  return plain.trim().toLowerCase();
}
