// AUTHOR SEAM — hire a candidate into the team: Person row + sign-in handoff.
//
// /staff/hiring tracked the recruiting decision only: Candidate_hire flipped a
// stage and nothing else — no Person, no role, no login. The CandidateHired
// event has no consumer, so the accepted offer dead-ended at a label. This
// seam is the missing wire: it creates the Person through the SAME generated
// command the Team roles hire form uses (Person_createViaHire — encrypted at
// rest, hireDate stamped) and links it on the candidate row via Candidate_hire.
// The CLIENT then calls authProvision.provisionStaffSignIn with the returned
// personId to create the Clerk account and email the password — that step
// stays client-orchestrated because it is an action (Clerk REST + mail) and
// actions cannot run inside a mutation.
//
// The generated create command does a plain insert: the manifest's
// `unique [tenantId, email]` is NOT enforced at the DB, so this seam resolves
// an existing live Person by decrypted email BEFORE creating and links to it
// instead of minting a duplicate profile.
//
// Gated at the workforceManageAccess tier, the EXACT roles base.manifest
// grants it (workforce_manager/admin/owner/system via `extends`), the same
// mirror hiringPipeline.ts keeps in sync with base.manifest.
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import type { Doc, Id } from "./_generated/dataModel";

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
    const candidate = await ctx.db.get(candidateId);
    if (
      !candidate ||
      candidate.deletedAt != null ||
      candidate.tenantId !== auth.tenantId
    ) {
      throw new ConvexError("Candidate not found.");
    }

    // Idempotent resume BEFORE the version check: if the hire already
    // committed (e.g. the caller lost the response before provisioning),
    // Candidate_hire has bumped the version, so a stale expectedVersion must
    // not block the recovery. Return the linked Person and let the client
    // finish the sign-in email. A stale CONCURRENT hire (two managers, same
    // candidate) is indistinguishable from a lost-response retry by payload,
    // and both end in the same place: provisionStaffSignIn re-issues the
    // password until the person first signs in (its own documented recovery
    // behavior — the same as re-pressing "Email sign-in" in Team roles), and
    // the busy-disable on the button stops accidental double-clicks. The
    // newest email simply wins; no operation-key machinery needed.
    if (candidate.stage === "hired") {
      if (candidate.hiredPersonId) {
        const linked = await ctx.db.get(
          candidate.hiredPersonId as Id<"people">,
        );
        if (linked && linked.deletedAt == null) {
          return {
            kind: "hired",
            personId: String(linked._id),
            email: normalized(candidate.email),
          };
        }
      }
      throw new ConvexError(
        "This candidate is already hired but their team profile is gone. Hire them again under Team roles.",
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

    // Person.email is required and Clerk needs a deliverable address — a
    // sign-in cannot exist without one. Record the recruiting decision and
    // hand the fix to the Team roles form instead of blocking the hire.
    const email = normalized(candidate.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      await ctx.runMutation(api.mutations.Candidate_hire, {
        docId: candidateId,
        version: expectedVersion ?? candidate.version,
      });
      return { kind: "hired_no_email" };
    }

    // Same email already on ANY profile? Link to it — never a duplicate.
    // Person_createViaHire is a plain insert and does not enforce the
    // manifest's unique [tenantId, email]; a duplicate row would also make
    // the hire's self-link ambiguous (two rows, one verified email).
    const existing = await findLivePersonByEmail(ctx, auth.tenantId, email);
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
      await ctx.runMutation(api.mutations.Candidate_hire, {
        docId: candidateId,
        version: expectedVersion ?? candidate.version,
        hiredPersonId: existing._id,
      });
      return { kind: "hired", personId: String(existing._id), email };
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
      version: expectedVersion ?? candidate.version,
      hiredPersonId: personId,
    });

    return { kind: "hired", personId: String(personId), email };
  },
});

function normalized(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * The tenant's Person carrying this email, ANY row — including terminated
 * ones, because terminate() sets deletedAt and a soft-deleted mailbox must
 * still block a duplicate. A live (non-terminated) row always wins over an
 * older terminated one — duplicate rows exist historically because the
 * create command never enforced uniqueness. Person.email is encrypted, so
 * the only honest match is a decrypt-and-compare over the tenant's roster —
 * single-tenant scale, the same shape as the roster scan the generated list
 * query and authLink already do.
 */
async function findLivePersonByEmail(
  ctx: MutationCtx,
  tenantId: string,
  email: string,
): Promise<Doc<"people"> | null> {
  const people = await ctx.db
    .query("people")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  let terminated: Doc<"people"> | null = null;
  for (const person of people) {
    if ((await readStoredEmail(ctx, person.email)) !== email) continue;
    if (person.deletedAt == null && String(person.status) !== "terminated") {
      return person;
    }
    terminated ??= person;
  }
  return terminated;
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
