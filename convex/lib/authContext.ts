/**
 * AUTHOR SEAM — emitted by Builder convex-application preset.
 * Not Manifest domain logic. Do not inline identity into generated mutations.
 *
 * Maps Convex ctx.auth.getUserIdentity() (+ tenant membership) to Manifest
 * { id, role, tenantId, disabledCapabilities }. Capsule role is owned by Person
 * (app settings) when a linked active Person exists; IdP/Clerk claims are only
 * a bootstrap fallback until that row is hired and linked.
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

  const linked = ctx.db
    ? await loadLinkedPerson(ctx.db, tenantClaim, identity.subject)
    : null;

  if (linked) {
    return {
      id: identity.subject,
      role: linked.role,
      tenantId: tenantClaim,
      roleSource: "person",
      personId: linked.personId,
      disabledCapabilities,
    };
  }

  return {
    id: identity.subject,
    role: roleClaim ? normalizeRole(roleClaim) : ANONYMOUS.role,
    tenantId: tenantClaim,
    roleSource: roleClaim ? "idp" : "anonymous",
    disabledCapabilities,
  };
}

async function loadLinkedPerson(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { query: (table: "people") => any },
  tenantId: string,
  authSubjectId: string,
): Promise<{ role: string; personId: string } | null> {
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
  if (typeof person.role !== "string" || person.role.length === 0) return null;
  return { role: person.role, personId: String(person._id) };
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
