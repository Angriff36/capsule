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
import { internal } from "../_generated/api";
import {
  loadDisabledOrgCapabilities,
  type OrgCapabilityId,
} from "./orgCapabilityGate";
import {
  pickLivePerson,
  tenantIdFromIdentityClaims,
} from "./personAuthPick";

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

  // Actions have no ctx.db: resolve through an internal query (same
  // identity) so Person-linked users are authorized in actions too.
  const runQuery = (ctx as { runQuery?: unknown }).runQuery;
  if (!ctx.db && typeof runQuery === "function") {
    return (await (
      runQuery as (ref: unknown, args: unknown) => Promise<AppAuthContext>
    )(internal.authLink.resolveAuthContext, {})) as AppAuthContext;
  }

  // 1. A linked, active Person decides tenant and role. No organization needed.
  //    Duplicate live rows (same email / same subject) pick deterministically
  //    instead of failing closed — AuthGate cannot send anyone to Team roles
  //    when Team roles is behind the same wall.
  const claims = identity as Record<string, unknown>;
  const org =
    typeof claims.o === "object" && claims.o !== null
      ? (claims.o as Record<string, unknown>)
      : undefined;
  const tenantClaim = tenantIdFromIdentityClaims(claims);
  const linked = ctx.db
    ? await loadPersonBySubject(ctx.db, identity.subject, tenantClaim)
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
  const roleClaim =
    (typeof claims.role === "string" && claims.role) ||
    (typeof org?.rol === "string" && org.rol) ||
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
  tenantId?: string,
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
  const person = pickLivePerson(rows, { subject: authSubjectId, tenantId });
  if (!person) return null;
  const hint = tenantId?.trim() ?? "";
  if (hint && person.tenantId !== hint) return null;
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
