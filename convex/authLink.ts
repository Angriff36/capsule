// AUTHOR-OWNED — not generated. First-sign-in self link: the sign-in's
// verified primary email (read from the identity provider's backend, never
// from the client) that matches exactly one active, unlinked Person becomes
// that Person's authSubjectId. After that, getAuthContext resolves tenant and
// role from the Person — no identity-provider organization needed. Nothing
// here grants a role; the Person already has one, set by an admin under Team
// roles. Hire already assigned that role; self-link only connects the
// verified mailbox so the hire → email → open-app path is not blocked.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import {
  decidePersonEmailLink,
  pickLivePerson,
  tenantIdFromIdentityClaims,
} from "./lib/personAuthPick";

/** Roles that carry adminAccess in src/foundation/base.manifest. */
const ADMIN_ROLES = new Set(["admin", "owner", "system"]);

export type LinkOutcome =
  | { linked: true; reason: "already" | "matched" }
  | {
      linked: false;
      reason:
        | "unauthenticated"
        | "not_configured"
        | "provider_error"
        | "no_email"
        | "email_unverified"
        | "no_match"
        | "ambiguous"
        | "released"
        | "needs_admin_link";
    };

/**
 * Auth context for ACTIONS: actions have no ctx.db, so getAuthContext calls
 * this through ctx.runQuery (same identity) to resolve the linked Person.
 */
export const resolveAuthContext = internalQuery({
  args: {},
  handler: async (ctx) => getAuthContext(ctx),
});

/** Client entry point: resolve the verified email, then link. */
export const linkSelfByEmail = action({
  args: {},
  handler: async (ctx): Promise<LinkOutcome> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { linked: false, reason: "unauthenticated" };
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { linked: false, reason: "not_configured" };

    const email = await verifiedPrimaryEmail(identity.subject, secret);
    if (email.kind !== "ok") return { linked: false, reason: email.kind };

    return await ctx.runMutation(internal.authLink.linkBySubjectEmail, {
      subject: identity.subject,
      email: email.value,
      tenantId: tenantIdFromIdentityClaims(
        identity as unknown as Record<string, unknown>,
      ),
    });
  },
});

type EmailLookup =
  | { kind: "ok"; value: string }
  | { kind: "provider_error" | "no_email" | "email_unverified" };

/**
 * Clerk backend: the user's PRIMARY email and whether the provider verified
 * it. No fallback to other addresses — the primary address is the trust
 * anchor. Provider failures are reported as such, not as "no email".
 */
async function verifiedPrimaryEmail(
  subject: string,
  secret: string,
): Promise<EmailLookup> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
  } catch {
    return { kind: "provider_error" };
  }
  if (!response.ok) return { kind: "provider_error" };
  const user = (await response.json()) as ClerkUser;
  const primary = primaryEmail(user);
  if (!primary) return { kind: "no_email" };
  if (primary.verification?.status !== "verified") {
    return { kind: "email_unverified" };
  }
  return { kind: "ok", value: primary.email_address.trim().toLowerCase() };
}

type ClerkUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{
    id: string;
    email_address: string;
    verification?: { status?: string } | null;
  }>;
};

function primaryEmail(user: ClerkUser) {
  if (!user.primary_email_address_id) return null;
  return (
    user.email_addresses?.find(
      (row) => row.id === user.primary_email_address_id,
    ) ?? null
  );
}

export const linkBySubjectEmail = internalMutation({
  args: {
    subject: v.string(),
    email: v.string(),
    tenantId: v.optional(v.string()),
  },
  handler: async (ctx, { subject, email, tenantId }): Promise<LinkOutcome> => {
    const linkedRows = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", subject))
      .collect();
    const activeLinks = linkedRows.filter(
      (row) => row.deletedAt == null && String(row.status) === "active",
    );

    // Candidates are only NEVER-LINKED people: rows where the field was never
    // set (a fresh hire). Rows an admin explicitly unlinked carry null
    // (Person.unlinkAccount) and are released on purpose — self-link must not
    // quietly hand the same account back; an admin relinks those per row.
    const unset = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", undefined))
      .collect();
    const active = (rows: typeof unset) =>
      rows.filter(
        (row) => row.deletedAt == null && String(row.status) === "active",
      );
    const matches = [];
    for (const person of active(unset)) {
      if ((await readEmail(ctx, person.email)) === email) matches.push(person);
    }
    if (matches.length === 0 && activeLinks.length === 0) {
      const released = await ctx.db
        .query("people")
        .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", null))
        .collect();
      for (const person of active(released)) {
        if ((await readEmail(ctx, person.email)) === email) {
          return { linked: false, reason: "released" };
        }
      }
      return { linked: false, reason: "no_match" };
    }

    // pickLivePerson is the shared live-row order. decidePersonEmailLink
    // refuses an unhinted cross-tenant persist and rematches when the JWT
    // hint does not match the already-linked pick.
    const decision = decidePersonEmailLink({
      subject,
      tenantId,
      linkedLive: activeLinks,
      neverLinkedLiveMatches: matches,
    });
    if (decision.kind === "already") {
      return { linked: true, reason: "already" };
    }
    if (decision.kind === "ambiguous") {
      return { linked: false, reason: "ambiguous" };
    }
    const person = pickLivePerson([decision.person], { subject, tenantId });
    if (!person) return { linked: false, reason: "ambiguous" };
    // Hire already assigned the role to this email. Linking connects the
    // mailbox we hired — it does not grant a new role. Admin rows used to
    // require a manual paste; that blocked the hire → email → open-app path.
    // A link left on a terminated/deleted row is cleared first, so a later
    // reactivation can never make two active rows claim this sign-in.
    for (const stale of linkedRows) {
      await ctx.db.patch(stale._id, { authSubjectId: null });
    }
    await ctx.db.patch(person._id, { authSubjectId: subject });
    return { linked: true, reason: "matched" };
  },
});

/**
 * What the caller's tenant is allowed to see of the identity provider: the
 * emails of ITS OWN active, unlinked staff rows (the admin typed those emails
 * when hiring). Nothing from other tenants leaks through.
 */
export const catalogScope = internalQuery({
  args: {},
  handler: async (ctx): Promise<{ wantedEmails: string[] }> => {
    const auth = await getAuthContext(ctx);
    if (!ADMIN_ROLES.has(auth.role) || !auth.tenantId) {
      return { wantedEmails: [] };
    }
    const own = await ctx.db
      .query("people")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();
    const wantedEmails: string[] = [];
    for (const row of own) {
      if (row.deletedAt != null || String(row.status) !== "active") continue;
      if (row.authSubjectId) continue;
      const email = await readEmail(ctx, row.email);
      if (email) wantedEmails.push(email);
    }
    return { wantedEmails };
  },
});

/** Of these subjects, the ones an active Person already holds (indexed). */
export const takenAmong = internalQuery({
  args: { subjects: v.array(v.string()) },
  handler: async (ctx, { subjects }): Promise<string[]> => {
    const taken: string[] = [];
    for (const subject of subjects) {
      const rows = await ctx.db
        .query("people")
        .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", subject))
        .collect();
      if (
        rows.some(
          (row) => row.deletedAt == null && String(row.status) === "active",
        )
      ) {
        taken.push(subject);
      }
    }
    return taken;
  },
});

export type SignInCatalog = {
  signIns: Array<{ userId: string; name: string; email: string | null }>;
  error: null | "forbidden" | "not_configured" | "provider_error";
};

/**
 * Admin-only, tenant-scoped: identity-provider sign-ins whose primary email
 * matches one of THIS tenant's active unlinked staff rows and that no active
 * Person holds yet. That is exactly the admin-link case (admin-capable
 * Persons that self-link refuses). Read-only; ids, names, emails only.
 */
export const listSignIns = action({
  args: {},
  handler: async (ctx): Promise<SignInCatalog> => {
    const auth = await ctx.runQuery(internal.authLink.resolveAuthContext, {});
    if (!ADMIN_ROLES.has(auth.role)) return { signIns: [], error: "forbidden" };
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { signIns: [], error: "not_configured" };
    const scope = await ctx.runQuery(internal.authLink.catalogScope, {});
    if (scope.wantedEmails.length === 0) return { signIns: [], error: null };

    // Ask the provider for exactly these emails (bounded; no paging).
    const users: ClerkUser[] = [];
    const batch = 50;
    for (let i = 0; i < scope.wantedEmails.length; i += batch) {
      const params = new URLSearchParams();
      for (const email of scope.wantedEmails.slice(i, i + batch)) {
        params.append("email_address", email);
      }
      params.set("limit", String(batch));
      let response: Response;
      try {
        response = await fetch(
          `https://api.clerk.com/v1/users?${params.toString()}`,
          { headers: { Authorization: `Bearer ${secret}` } },
        );
      } catch {
        return { signIns: [], error: "provider_error" };
      }
      if (!response.ok) return { signIns: [], error: "provider_error" };
      users.push(...((await response.json()) as ClerkUser[]));
    }

    const wanted = new Set(scope.wantedEmails);
    // Same proof as self-link: the PRIMARY email, verified by the provider.
    const byEmail = users
      .map((user) => ({ user, primary: primaryEmail(user) }))
      .filter(
        ({ primary }) =>
          primary?.verification?.status === "verified" &&
          wanted.has(primary.email_address.trim().toLowerCase()),
      );
    // Tenant proof: an account that belongs to some OTHER tenant's
    // organization is never offered here — only accounts with no
    // organization (pure sign-ins) or members of this tenant's own.
    const candidates = [];
    for (const candidate of byEmail) {
      const orgs = await organizationIds(candidate.user.id, secret);
      if (orgs === null) return { signIns: [], error: "provider_error" };
      if (orgs.length === 0 || orgs.includes(auth.tenantId)) {
        candidates.push(candidate);
      }
    }
    const taken = new Set(
      await ctx.runQuery(internal.authLink.takenAmong, {
        subjects: candidates.map(({ user }) => user.id),
      }),
    );
    return {
      signIns: candidates
        .filter(({ user }) => !taken.has(user.id))
        .map(({ user, primary }) => ({
          userId: user.id,
          name:
            [user.first_name, user.last_name].filter(Boolean).join(" ") ||
            primary?.email_address ||
            user.id,
          email: primary?.email_address ?? null,
        })),
      error: null,
    };
  },
});

/** Organization ids a provider account belongs to; null on provider error. */
async function organizationIds(
  userId: string,
  secret: string,
): Promise<string[] | null> {
  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(userId)}/organization_memberships?limit=100`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      data?: Array<{ organization?: { id?: string } }>;
    };
    return (body.data ?? [])
      .map((row) => row.organization?.id ?? "")
      .filter((id) => id.length > 0);
  } catch {
    return null;
  }
}

/** Person.email is an encrypted field; decode the envelope, else take it raw. */
async function readEmail(ctx: unknown, raw: unknown): Promise<string> {
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
