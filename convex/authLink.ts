// AUTHOR-OWNED — not generated. First-sign-in self link: the sign-in's
// verified primary email (read from the identity provider's backend, never
// from the client) that matches exactly one active, unlinked Person becomes
// that Person's authSubjectId. After that, getAuthContext resolves tenant and
// role from the Person — no identity-provider organization needed. Nothing
// here grants a role; the Person already has one, set by an admin under Team
// roles. Admin-capable Persons are never self-linked: mailbox control alone
// must not hand out adminAccess (Person.linkAccount keeps that behind an
// admin, see src/identity/person.manifest).
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";

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
  args: { subject: v.string(), email: v.string() },
  handler: async (ctx, { subject, email }): Promise<LinkOutcome> => {
    const linkedRows = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", subject))
      .collect();
    const activeLinks = linkedRows.filter(
      (row) => row.deletedAt == null && String(row.status) === "active",
    );
    if (activeLinks.length > 1) return { linked: false, reason: "ambiguous" };
    if (activeLinks.length === 1) return { linked: true, reason: "already" };

    // Candidates are only the UNLINKED people (index on authSubjectId: rows
    // with the field unset and rows with it null) — never the whole table.
    const unset = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", undefined))
      .collect();
    const nulled = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", null))
      .collect();
    const matches = [];
    for (const person of [...unset, ...nulled]) {
      if (person.deletedAt != null) continue;
      if (String(person.status) !== "active") continue;
      if ((await readEmail(ctx, person.email)) === email) matches.push(person);
    }
    if (matches.length === 0) return { linked: false, reason: "no_match" };
    if (matches.length > 1) return { linked: false, reason: "ambiguous" };

    const person = matches[0]!;
    if (ADMIN_ROLES.has(String(person.role))) {
      return { linked: false, reason: "needs_admin_link" };
    }
    // A link left on a terminated/deleted row is cleared first, so a later
    // reactivation can never make two active rows claim this sign-in.
    for (const stale of linkedRows) {
      await ctx.db.patch(stale._id, { authSubjectId: null });
    }
    await ctx.db.patch(person._id, { authSubjectId: subject });
    return { linked: true, reason: "matched" };
  },
});

/** Subjects already held by an active Person anywhere (never re-offered). */
export const activeLinkedSubjects = internalQuery({
  args: {},
  handler: async (ctx): Promise<string[]> => {
    const auth = await getAuthContext(ctx);
    if (!ADMIN_ROLES.has(auth.role)) return [];
    const people = await ctx.db.query("people").collect();
    return people
      .filter(
        (row) =>
          row.deletedAt == null &&
          String(row.status) === "active" &&
          typeof row.authSubjectId === "string" &&
          row.authSubjectId.length > 0,
      )
      .map((row) => row.authSubjectId as string);
  },
});

export type SignInCatalog = {
  signIns: Array<{ userId: string; name: string; email: string | null }>;
  error: null | "forbidden" | "not_configured" | "provider_error";
};

/**
 * Admin-only: sign-ins known to the identity provider that are not already
 * held by an active Person, so Team roles can link a staff row to an account
 * that is not an organization member — including admin-capable Persons that
 * self-link refuses. Read-only; ids, names, and primary emails only.
 */
export const listSignIns = action({
  args: {},
  handler: async (ctx): Promise<SignInCatalog> => {
    const auth = await ctx.runQuery(internal.authLink.resolveAuthContext, {});
    if (!ADMIN_ROLES.has(auth.role)) return { signIns: [], error: "forbidden" };
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { signIns: [], error: "not_configured" };
    const taken = new Set(
      await ctx.runQuery(internal.authLink.activeLinkedSubjects, {}),
    );

    const signIns: SignInCatalog["signIns"] = [];
    const pageSize = 100;
    for (let offset = 0; offset < 2000; offset += pageSize) {
      let response: Response;
      try {
        response = await fetch(
          `https://api.clerk.com/v1/users?limit=${pageSize}&offset=${offset}&order_by=-created_at`,
          { headers: { Authorization: `Bearer ${secret}` } },
        );
      } catch {
        return { signIns: [], error: "provider_error" };
      }
      if (!response.ok) return { signIns: [], error: "provider_error" };
      const users = (await response.json()) as ClerkUser[];
      for (const user of users) {
        if (taken.has(user.id)) continue;
        const primary = primaryEmail(user);
        const name =
          [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          primary?.email_address ||
          user.id;
        signIns.push({
          userId: user.id,
          name,
          email: primary?.email_address ?? null,
        });
      }
      if (users.length < pageSize) break;
    }
    return { signIns, error: null };
  },
});

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
