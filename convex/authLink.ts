// AUTHOR-OWNED — not generated. First-sign-in self link: a verified sign-in
// email that matches exactly one active, unlinked Person becomes that Person's
// authSubjectId. After that, getAuthContext resolves tenant and role from the
// Person (no identity-provider organization needed). The only trust anchor is
// the IdP-verified email; nothing here grants a role — the Person already has
// one, set by an admin under Team roles.
import { mutation } from "./_generated/server";
import { decrypt } from "./lib/encryption";

type Outcome =
  | { linked: true; reason: "already" | "matched" }
  | {
      linked: false;
      reason:
        | "unauthenticated"
        | "no_email"
        | "email_unverified"
        | "no_match"
        | "ambiguous";
    };

export const linkSelfByEmail = mutation({
  args: {},
  handler: async (ctx): Promise<Outcome> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { linked: false, reason: "unauthenticated" };
    const email = String(identity.email ?? "")
      .trim()
      .toLowerCase();
    if (!email) return { linked: false, reason: "no_email" };
    if (identity.emailVerified !== true) {
      return { linked: false, reason: "email_unverified" };
    }

    const already = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) =>
        q.eq("authSubjectId", identity.subject),
      )
      .first();
    if (already) return { linked: true, reason: "already" };

    const people = await ctx.db.query("people").collect();
    const matches = [];
    for (const person of people) {
      if (person.deletedAt != null) continue;
      if (String(person.status) !== "active") continue;
      if (person.authSubjectId) continue;
      const stored = await readEmail(ctx, person.email);
      if (stored === email) matches.push(person);
    }
    if (matches.length === 0) return { linked: false, reason: "no_match" };
    if (matches.length > 1) return { linked: false, reason: "ambiguous" };

    await ctx.db.patch(matches[0]!._id, { authSubjectId: identity.subject });
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
