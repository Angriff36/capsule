// AUTHOR-OWNED — hire-time Capsule sign-in. Creates the identity-provider
// account, links it to the Person, and emails a one-click app link plus a
// password when the person does not already have one.
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  ClerkSignInTicketIssuer,
  capsuleSignInUrl,
} from "./lib/clerkSignInTicket";
import { ClerkStaffAccountDirectory } from "./lib/clerkStaffAccount";
import { decrypt } from "./lib/encryption";
import {
  StaffSignInMailer,
  readStaffSignInMailEnvironment,
} from "./lib/staffSignInMailer";
import { StaffSignInPasswordFactory } from "./lib/staffSignInPassword";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);
const CAN_PROVISION = new Set([...ADMIN_ROLES, "workforce_manager"]);

export type StaffSignInProvisionResult = {
  emailed: true;
  email: string;
  passwordIssued: boolean;
};

export const loadPersonForProvision = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const auth = await getAuthContext(ctx);
    if (!CAN_PROVISION.has(auth.role) || !auth.tenantId) return null;
    const row = await ctx.db.get(personId);
    if (!row || row.deletedAt != null) return null;
    if (row.tenantId !== auth.tenantId) return null;
    if (String(row.status) !== "active") return null;
    return {
      personId: String(row._id),
      tenantId: row.tenantId,
      givenName: row.givenName,
      familyName: row.familyName,
      role: String(row.role ?? ""),
      email: await readStoredEmail(ctx, row.email),
      authSubjectId:
        typeof row.authSubjectId === "string" ? row.authSubjectId : null,
    };
  },
});

export const companyNameForProvision = internalQuery({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return "your team";
    const organizations = await ctx.db
      .query("organizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();
    const live =
      organizations.find(
        (row) => row.deletedAt == null && String(row.status) === "active",
      ) ?? organizations.find((row) => row.deletedAt == null);
    return live?.brandDisplayName?.trim() || live?.name?.trim() || "your team";
  },
});

export const linkProvisionedSubject = internalMutation({
  args: {
    personId: v.id("people"),
    authSubjectId: v.string(),
  },
  handler: async (ctx, { personId, authSubjectId }) => {
    const auth = await getAuthContext(ctx);
    if (!CAN_PROVISION.has(auth.role) || !auth.tenantId) {
      throw new Error("Only a manager can send a sign-in.");
    }
    const row = await ctx.db.get(personId);
    if (!row || row.deletedAt != null || row.tenantId !== auth.tenantId) {
      throw new Error("Team member not found.");
    }
    if (row.authSubjectId === authSubjectId) return;
    if (row.authSubjectId) {
      throw new Error(
        "This person already has a different sign-in. Unlink it first if that is wrong.",
      );
    }
    const taken = await ctx.db
      .query("people")
      .withIndex("by_authSubjectId", (q) =>
        q.eq("authSubjectId", authSubjectId),
      )
      .collect();
    const clash = taken.find(
      (other) =>
        other._id !== personId &&
        other.deletedAt == null &&
        String(other.status) === "active",
    );
    if (clash) {
      throw new Error("That sign-in is already used by another team member.");
    }
    await ctx.db.patch(personId, { authSubjectId });
  },
});

export const provisionStaffSignIn = action({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }): Promise<StaffSignInProvisionResult> => {
    const auth = await ctx.runQuery(internal.authLink.resolveAuthContext, {});
    if (!CAN_PROVISION.has(auth.role)) {
      throw new Error("Only a manager can send a sign-in.");
    }
    const secret = process.env.CLERK_SECRET_KEY?.trim();
    if (!secret) {
      throw new Error(
        "Sign-in setup is missing CLERK_SECRET_KEY on this deployment.",
      );
    }
    const person = await ctx.runQuery(
      internal.authProvision.loadPersonForProvision,
      { personId },
    );
    if (!person || !person.email) {
      throw new Error("Team member not found or has no email.");
    }
    if (ADMIN_ROLES.has(person.role) && !ADMIN_ROLES.has(auth.role)) {
      throw new Error("Only an admin can send a sign-in for an admin.");
    }

    const directory = new ClerkStaffAccountDirectory(secret);
    const existing = await directory.findByEmail(person.email);
    const passwords = new StaffSignInPasswordFactory();
    let account = existing;
    let issuedPassword: string | undefined;
    if (!account) {
      issuedPassword = passwords.next();
      account = await directory.createWithPassword({
        email: person.email,
        givenName: person.givenName,
        familyName: person.familyName,
        password: issuedPassword,
      });
    } else if (!account.passwordEnabled || !account.hasSignedIn) {
      // Re-issue until they have actually opened the app so a failed first
      // email does not leave a password nobody knows.
      issuedPassword = passwords.next();
      await directory.setPassword(account.userId, issuedPassword);
    }

    await ctx.runMutation(internal.authProvision.linkProvisionedSubject, {
      personId,
      authSubjectId: account.userId,
    });

    const mailer = new StaffSignInMailer(readStaffSignInMailEnvironment());
    const ticket = await new ClerkSignInTicketIssuer(secret).issue(
      account.userId,
    );
    const companyName: string = await ctx.runQuery(
      internal.authProvision.companyNameForProvision,
      {},
    );
    await mailer.send({
      companyName,
      givenName: person.givenName,
      email: person.email,
      signInUrl: capsuleSignInUrl(mailer.appOrigin(), ticket.token),
      ...(issuedPassword ? { password: issuedPassword } : {}),
    });

    return {
      emailed: true,
      email: person.email,
      passwordIssued: Boolean(issuedPassword),
    };
  },
});

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
