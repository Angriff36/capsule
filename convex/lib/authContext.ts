/**
 * AUTHOR SEAM — emitted by Builder convex-application preset.
 * Not Manifest domain logic. Do not inline identity into generated mutations.
 *
 * Maps Convex ctx.auth.getUserIdentity() (+ custom claims) to Manifest
 * { id, role, tenantId, personId? }. Unauthenticated callers get anonymous
 * sentinels that match no role list and no tenant row (fail closed).
 *
 * When an active Person is linked via authSubjectId, personId is that
 * people-table document id so Manifest commands can write Person FKs
 * (e.g. PrepTask.assignedToId) without storing the Clerk subject string.
 * user.id remains the Clerk auth subject for authSubjectId comparisons.
 */
import type { Auth } from "convex/server";

export interface AppAuthContext {
  id: string;
  role: string;
  tenantId: string;
  /** Linked active Person document id when authSubjectId matches. */
  personId?: string;
}

const ANONYMOUS: AppAuthContext = { id: "", role: "anonymous", tenantId: "" };

type PersonRow = {
  _id: string;
  status?: string;
  deletedAt?: number | null;
  authSubjectId?: string | null;
};

/** Convex query/mutation ctx — `db` typed loosely so author seam stays free of generated DataModel imports. */
export async function getAuthContext(ctx: {
  auth: Auth;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: {
    query: (table: "people") => any;
  };
}): Promise<AppAuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return ANONYMOUS;

  const claims = identity as Record<string, unknown>;
  const org =
    typeof claims.o === "object" && claims.o !== null
      ? (claims.o as Record<string, unknown>)
      : undefined;

  const roleClaim =
    (typeof claims.role === "string" && claims.role) ||
    (typeof org?.rol === "string" && org.rol) ||
    "";
  const tenantClaim =
    (typeof claims.tenantId === "string" && claims.tenantId) ||
    (typeof org?.id === "string" && org.id) ||
    (typeof claims.org_id === "string" && claims.org_id) ||
    "";

  const base: AppAuthContext = {
    id: identity.subject,
    role: roleClaim ? normalizeRole(roleClaim) : ANONYMOUS.role,
    tenantId: tenantClaim || ANONYMOUS.tenantId,
  };

  if (!base.tenantId || !ctx.db) return base;

  const personId = await loadLinkedPersonId(
    ctx.db,
    base.tenantId,
    identity.subject,
  );
  if (!personId) return base;
  return { ...base, personId };
}

async function loadLinkedPersonId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { query: (table: "people") => any },
  tenantId: string,
  authSubjectId: string,
): Promise<string | null> {
  const person = (await db
    .query("people")
    .withIndex("by_tenantId", (q: { eq: (f: string, v: string) => unknown }) =>
      q.eq("tenantId", tenantId),
    )
    .filter(
      (q: {
        and: (...args: unknown[]) => unknown;
        eq: (left: unknown, right: unknown) => unknown;
        field: (name: string) => unknown;
      }) =>
        q.and(
          q.eq(q.field("authSubjectId"), authSubjectId),
          q.eq(q.field("status"), "active"),
        ),
    )
    .first()) as PersonRow | null;

  if (!person || person.deletedAt != null) return null;
  return String(person._id);
}

/** Strip IdP role namespaces (e.g. Clerk org:admin → admin) for Manifest guards. */
function normalizeRole(role: string): string {
  return role.startsWith("org:") ? role.slice(4) : role;
}

export function requireTenant(auth: AppAuthContext): string {
  if (!auth.tenantId) {
    throw new Error("No tenant in authentication context");
  }
  return auth.tenantId;
}
