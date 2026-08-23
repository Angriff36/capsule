/**
 * AUTHOR SEAM — emitted by Builder convex-application preset.
 * Not Manifest domain logic. Do not inline identity into generated mutations.
 *
 * Maps Convex ctx.auth.getUserIdentity() to Manifest
 * { id, role, tenantId, disabledCapabilities }.
 *
 * Person-first: the Person row linked to the sign-in (people.authSubjectId)
 * owns the tenant AND the role. That is what Team roles edits, and it needs no
 * identity-provider organization. IdP/Clerk claims (org membership or a JWT
 * template) remain a bootstrap fallback for sign-ins that are not linked yet,
 * so existing org-based admins keep working while the link is made.
 *
 * disabledCapabilities come from OrganizationCapabilitySetting (Permissions
 * toggles) and are enforced by checkRole on generated mutations/queries.
 */
import type { Auth } from "convex/server";
import {
  loadDisabledOrgCapabilities,
  type OrgCapabilityId,
} from "./orgCapabilityGate";

export interface AppAuthContext {
  id: string;
  role: string;
  tenantId: string;
  /** Where `role` came from — useful for UI/debug. */
  roleSource: "person" | "idp" | "anonymous";
  personId?: string;
  /** Org capability ids explicitly disabled for this tenant (kill-switches). */
  disabledCapabilities: OrgCapabilityId[];
}

const ANONYMOUS: AppAuthContext = {
  id: "",
  role: "anonymous",
  tenantId: "",
  roleSource: "anonymous",
  disabledCapabilities: [],
};

type PersonRow = {
  _id: string;
  tenantId?: string;
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
    query: (table: "people" | "organizationCapabilitySettings") => any;
  };
}): Promise<AppAuthContext> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return ANONYMOUS;

  // 1. A linked, active Person decides tenant and role. No organization needed.
  const linked = ctx.db
    ? await loadPersonBySubject(ctx.db, identity.subject)
    : null;
  if (linked) {
    return {
      id: identity.subject,
      role: linked.role,
      tenantId: linked.tenantId,
      roleSource: "person",
      personId: linked.personId,
      disabledCapabilities: ctx.db
        ? await loadDisabledOrgCapabilities(ctx.db, linked.tenantId)
        : [],
    };
  }

  // 2. Bootstrap fallback: tenant/role claims from the IdP (org membership or
  //    a JWT template) for sign-ins that are not linked to a Person yet.
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

  if (!tenantClaim) {
    return {
      id: identity.subject,
      role: ANONYMOUS.role,
      tenantId: "",
      roleSource: "anonymous",
      disabledCapabilities: [],
    };
  }

  const disabledCapabilities = ctx.db
    ? await loadDisabledOrgCapabilities(ctx.db, tenantClaim)
    : [];

  return {
    id: identity.subject,
    role: roleClaim ? normalizeRole(roleClaim) : ANONYMOUS.role,
    tenantId: tenantClaim,
    roleSource: roleClaim ? "idp" : "anonymous",
    disabledCapabilities,
  };
}

/** The active Person linked to this sign-in, in whichever tenant hired them. */
async function loadPersonBySubject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { query: (table: "people") => any },
  authSubjectId: string,
): Promise<{ role: string; personId: string; tenantId: string } | null> {
  const rows = (await db
    .query("people")
    .withIndex(
      "by_authSubjectId",
      (q: { eq: (f: string, v: string) => unknown }) =>
        q.eq("authSubjectId", authSubjectId),
    )
    .filter(
      (q: {
        eq: (left: unknown, right: unknown) => unknown;
        field: (name: string) => unknown;
      }) => q.eq(q.field("status"), "active"),
    )
    .collect()) as PersonRow[];
  const active = rows.filter((row) => row.deletedAt == null);
  // One sign-in, one active Person. Two active rows (e.g. the same subject
  // linked in two tenants) is ambiguous: fail closed rather than pick one.
  if (active.length !== 1) return null;
  const person = active[0]!;
  if (typeof person.role !== "string" || person.role.length === 0) return null;
  if (typeof person.tenantId !== "string" || person.tenantId.length === 0) {
    return null;
  }
  return {
    role: person.role,
    personId: String(person._id),
    tenantId: person.tenantId,
  };
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
