// AUTHOR-OWNED - profile email correction after hire (#270).
// Runs the governed Person.correctEmail command, then moves the linked
// sign-in account (if any) to the same address so the invitation, password
// reset and the Team roles row all point at one mailbox.
import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { ClerkStaffAccountDirectory } from "./lib/clerkStaffAccount";
import { decrypt } from "./lib/encryption";

const ADMIN_ROLES = new Set(["admin", "owner", "system"]);
const CAN_CORRECT = new Set([...ADMIN_ROLES, "workforce_manager"]);
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export type StaffEmailCorrectionResult = {
  email: string;
  /** The linked sign-in account now uses the new address too. */
  signInUpdated: boolean;
  /** Set when the profile changed but the sign-in account could not follow. */
  warning: string | null;
};

export const loadPersonForEmailCorrection = internalQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const auth = await getAuthContext(ctx);
    if (!CAN_CORRECT.has(auth.role) || !auth.tenantId) return null;
    const row = await ctx.db.get(personId);
    if (!row || row.deletedAt != null || row.tenantId !== auth.tenantId) {
      return null;
    }
    return {
      role: String(row.role),
      version: row.version,
      email: await readStoredEmail(ctx, row.email),
      authSubjectId:
        typeof row.authSubjectId === "string" ? row.authSubjectId : null,
    };
  },
});

export const correctStaffEmail = action({
  args: { personId: v.id("people"), email: v.string() },
  handler: async (
    ctx,
    { personId, email },
  ): Promise<StaffEmailCorrectionResult> => {
    const wanted = email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(wanted)) {
      throw new ConvexError("Enter a deliverable email address.");
    }
    const auth = await ctx.runQuery(internal.authLink.resolveAuthContext, {});
    if (!CAN_CORRECT.has(auth.role)) {
      throw new ConvexError(
        "Only a workforce manager can change a team member's email.",
      );
    }
    const person = await ctx.runQuery(
      internal.personEmail.loadPersonForEmailCorrection,
      { personId },
    );
    if (!person) throw new ConvexError("Team member not found.");
    // Same escalation rule as linkAccount: touching the mailbox that receives
    // an admin's sign-in is admin-only.
    if (ADMIN_ROLES.has(person.role) && !ADMIN_ROLES.has(auth.role)) {
      throw new ConvexError("Only an admin can change an admin's email.");
    }
    if (person.email === wanted) {
      return { email: wanted, signInUpdated: false, warning: null };
    }

    await ctx.runMutation(api.mutations.Person_correctEmail, {
      docId: personId,
      email: wanted,
      version: person.version,
    });

    if (!person.authSubjectId) {
      return { email: wanted, signInUpdated: false, warning: null };
    }
    const secret = process.env.CLERK_SECRET_KEY?.trim();
    if (!secret) {
      return {
        email: wanted,
        signInUpdated: false,
        warning:
          "The profile now uses the new email, but this deployment cannot reach the sign-in service (CLERK_SECRET_KEY missing), so their sign-in still uses the old address.",
      };
    }
    try {
      await new ClerkStaffAccountDirectory(secret).changePrimaryEmail(
        person.authSubjectId,
        wanted,
      );
      return { email: wanted, signInUpdated: true, warning: null };
    } catch (error) {
      return {
        email: wanted,
        signInUpdated: false,
        warning: `The profile now uses ${wanted}, but their sign-in account could not be moved${
          error instanceof Error ? `: ${error.message}` : ""
        }. Unlink the sign-in on their row and email a new one.`,
      };
    }
  },
});

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
