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
// line, not grant a manager/lead tier — kitchen_lead is included because it
// carries kitchenLeadAccess (cancel batches, block prep tasks). Mirrors the
// assignRole/linkAccount escalation guards. Keep in sync with base.manifest.
const PRIVILEGED_HIRE_ROLES = new Set([
  "kitchen_lead",
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
    // Explicit reactivation intent. The UI sends true only from the
    // "Restore and resend" state — a plain resend click never reactivates,
    // even if the profile went inactive after the page rendered.
    restore: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { candidateId, expectedVersion, restore },
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
      if (linked) {
        // hiredPersonId is settable through the public Candidate_hire with no
        // tenant validation, so never decrypt or trust a foreign row.
        if (linked.tenantId !== auth.tenantId) {
          throw new ConvexError(
            "This hire's profile link is invalid. Clear it under Team roles.",
          );
        }
        // Resending must never SILENTLY restore access: for an inactive
        // profile the UI labels this action "Restore and resend", so the
        // click itself is the explicit reactivation decision. A removed
        // (terminated/deleted) profile cannot come back at all.
        if (
          linked.deletedAt != null ||
          String(linked.status) === "terminated"
        ) {
          throw new ConvexError(
            "This hire's team profile was removed. Hire them again under Team roles.",
          );
        }
        if (String(linked.status) === "inactive") {
          // Reactivation requires the caller to have SEEN the inactive state
          // (the "Restore and resend" button sets restore). A stale page that
          // still says "Resend sign-in" must not flip access back on.
          if (restore !== true) {
            throw new ConvexError(
              "This hire's team profile is inactive. Reload the page and use Restore and resend.",
            );
          }
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
        // Credentials go to the LINKED PROFILE's address — it owns the Clerk
        // account. A KM re-import can patch a different email onto the
        // candidate row even after hire; refuse to silently mail the old
        // mailbox while the card shows a new one.
        const personEmail = await readStoredEmail(ctx, linked.email);
        const candidateEmail = normalized(candidate.email);
        if (candidateEmail && candidateEmail !== personEmail) {
          throw new ConvexError(
            `The candidate row says ${candidateEmail} but their sign-in profile uses ${personEmail}. Fix the profile under Team roles, then resend.`,
          );
        }
        // NOTE: an ACTIVE privileged profile is NOT gated here on purpose.
        // The link already exists — resending grants nothing new, and
        // provisionStaffSignIn already lets a workforce manager provision any
        // non-admin Person (the same rule as "Email sign-in" in Team roles).
        return {
          kind: "hired",
          personId: String(linked._id),
          email: personEmail || candidateEmail,
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
    // EXCEPTION: linking an already-ACTIVE, already-AUTH-LINKED profile
    // grants nothing new — the account exists and already holds the role —
    // so legacy reconciliation (hired without a link) is bookkeeping, not
    // elevation, and stays a workforce-manager action.
    const alreadyAccountable =
      existing != null &&
      existing.status === "active" &&
      Boolean(existing.authSubjectId);
    const effectiveRole = existing
      ? String(existing.role)
      : candidate.roleAppliedFor;
    if (
      !alreadyAccountable &&
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
      // NOTE (declined review finding): an existing profile KEEPS its role —
      // a returning hire whose applied role differs from their old one (a
      // kitchen veteran applying to sales) reuses their profile unchanged.
      // Changing a role is admin-only, and blocking the mismatch would send
      // every returning seasonal hire to an admin. The Person row remains
      // the truth for what the account can do.
    } else {
      const fullName = candidate.fullName.trim();
      const parts = fullName.split(/\s+/u);
      const givenName = parts[0] ?? "";
      const familyName =
        parts.length > 1 ? parts.slice(1).join(" ") : givenName;
      // NOTE (declined): mononyms repeat the word as the family name
      // ("Prince Prince") — Person requires both fields and inventing a
      // placeholder is worse. Correct the roster entry after hire if needed.
      if (!givenName) {
        throw new ConvexError("Candidate has no name to hire with.");
      }
      const result = await ctx.runMutation(api.mutations.Person_createViaHire, {
        givenName,
        familyName,
        email,
        phone: candidate.phone ?? undefined,
        role: candidate.roleAppliedFor,
        // Email-scoped: a rehire after reopening + an email change must
        // create a FRESH profile, not replay the original hire's cached
        // create (which would re-link the old mailbox).
        idempotencyKey: `candidateHire:${auth.tenantId}:${candidateId}:${email}`,
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
  let inactive: Doc<"people"> | null = null;
  let terminated: Doc<"people"> | null = null;
  for (const person of people) {
    if ((await readStoredEmail(ctx, person.email)) !== email) continue;
    // A LIVE profile always beats a dormant one, whatever the link state —
    // reactivating a stale duplicate would resurrect old permissions.
    // Within dormant, an inactive row (recoverable) beats a terminated one.
    if (person.deletedAt == null && String(person.status) === "active") {
      if (person.authSubjectId) return person;
      unlinked ??= person;
    } else if (person.deletedAt == null) {
      inactive ??= person;
    } else {
      terminated ??= person;
    }
  }
  return unlinked ?? inactive ?? terminated;
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
