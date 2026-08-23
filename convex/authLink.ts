// AUTHOR-OWNED — not generated. First-sign-in self link: the sign-in's
// verified primary email (read from the identity provider's backend, never
// from the client) that matches exactly one active, unlinked Person becomes
// that Person's authSubjectId. After that, getAuthContext resolves tenant and
// role from the Person — no identity-provider organization needed. Nothing
// here grants a role; the Person already has one, set by an admin under Team
// roles.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation } from "./_generated/server";
import { decrypt } from "./lib/encryption";

export type LinkOutcome =
  | { linked: true; reason: "already" | "matched" }
  | {
      linked: false;
      reason:
        | "unauthenticated"
        | "not_configured"
        | "no_email"
        | "email_unverified"
        | "no_match"
        | "ambiguous";
    };

/** Client entry point: resolve the verified email, then link. */
export const linkSelfByEmail = action({
  args: {},
  handler: async (ctx): Promise<LinkOutcome> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { linked: false, reason: "unauthenticated" };
    const secret = process.env.CLERK_SECRET_KEY;
    if (!secret) return { linked: false, reason: "not_configured" };

    const email = await verifiedPrimaryEmail(identity.subject, secret);
    if (email === null) return { linked: false, reason: "no_email" };
    if (email === "") return { linked: false, reason: "email_unverified" };

    return await ctx.runMutation(internal.authLink.linkBySubjectEmail, {
      subject: identity.subject,
      email,
    });
  },
});

/**
 * Clerk backend: the user's primary email and whether the provider verified
 * it. Returns null when there is no email, "" when it is not verified.
 */
async function verifiedPrimaryEmail(
  subject: string,
  secret: string,
): Promise<string | null> {
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(subject)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  if (!response.ok) return null;
  const user = (await response.json()) as {
    primary_email_address_id?: string | null;
    email_addresses?: Array<{
      id: string;
      email_address: string;
      verification?: { status?: string } | null;
    }>;
  };
  const primary =
    user.email_addresses?.find(
      (row) => row.id === user.primary_email_address_id,
    ) ?? user.email_addresses?.[0];
  if (!primary?.email_address) return null;
  if (primary.verification?.status !== "verified") return "";
  return primary.email_address.trim().toLowerCase();
}

export const linkBySubjectEmail = internalMutation({
  args: { subject: v.string(), email: v.string() },
  handler: async (ctx, { subject, email }): Promise<LinkOutcome> => {
    const already = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) => q.eq("authSubjectId", subject))
      .first();
    if (already) return { linked: true, reason: "already" };

    const people = await ctx.db.query("people").collect();
    const matches = [];
    for (const person of people) {
      if (person.deletedAt != null) continue;
      if (String(person.status) !== "active") continue;
      if (person.authSubjectId) continue;
      if ((await readEmail(ctx, person.email)) === email) matches.push(person);
    }
    if (matches.length === 0) return { linked: false, reason: "no_match" };
    if (matches.length > 1) return { linked: false, reason: "ambiguous" };

    await ctx.db.patch(matches[0]!._id, { authSubjectId: subject });
    return { linked: true, reason: "matched" };
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
