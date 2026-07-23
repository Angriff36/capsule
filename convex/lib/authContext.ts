/**
 * AUTHOR SEAM — emitted by Builder convex-application preset.
 * Not Manifest domain logic. Do not inline identity into generated mutations.
 *
 * Maps Convex ctx.auth.getUserIdentity() (+ custom claims) to Manifest
 * { id, role, tenantId, personId? }. Unauthenticated callers get anonymous
 * sentinels that match no role list and no tenant row (fail closed).
 *
 * Capsule role is owned by Person (Admin → Permissions / hire+assignRole)
 * when a linked active Person with a role exists. IdP/Clerk claims are only
 * a bootstrap fallback until that row is hired and linked.
 *
 * personId is the people-table document id so Manifest commands can write
 * Person FKs (e.g. PrepTask.assignedToId). user.id remains the Clerk auth
 * subject for authSubjectId comparisons.
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
  role?: string;
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

  const idpRole = roleClaim ? normalizeRole(roleClaim) : ANONYMOUS.role;
  const base: AppAuthContext = {
    id: identity.subject,
    role: idpRole,
    tenantId: tenantClaim || ANONYMOUS.tenantId,
  };

  if (!base.tenantId || !ctx.db) return base;

  const linked = await loadLinkedPerson(
    ctx.db,
    base.tenantId,
    identity.subject,
  );
  if (!linked) return base;

  return {
    ...base,
    personId: linked.personId,
    role: linked.role ?? base.role,
  };
}

async function loadLinkedPerson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { query: (table: "people") => any },
  tenantId: string,
  authSubjectId: string,
): Promise<{ personId: string; role: string | null } | null> {
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
  const role =
    typeof person.role === "string" && person.role.length > 0
      ? person.role
      : null;
  return { personId: String(person._id), role };
}

/** Strip IdP role namespaces (e.g. Clerk org:admin → admin) for Manifest guards. */
function normalizeRole(role: string): string {
  const trimmed = role.trim();
  return trimmed.startsWith("org:") ? trimmed.slice(4) : trimmed;
}

export function requireTenant(auth: AppAuthContext): string {
  if (!auth.tenantId) {
    throw new Error("No tenant in authentication context");
  }
  return auth.tenantId;
}
