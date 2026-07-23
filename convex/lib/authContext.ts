/**
 * AUTHOR SEAM — emitted by Builder convex-application preset.
 * Not Manifest domain logic. Do not inline identity into generated mutations.
 *
 * Maps Convex ctx.auth.getUserIdentity() (+ custom claims) to Manifest
 * { id, role, tenantId }. Unauthenticated callers get anonymous sentinels
 * that match no role list and no tenant row (fail closed).
 */
import type { Auth } from "convex/server";

export interface AppAuthContext {
  id: string;
  role: string;
  tenantId: string;
}

const ANONYMOUS: AppAuthContext = { id: "", role: "anonymous", tenantId: "" };

export async function getAuthContext(ctx: {
  auth: Auth;
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

  return {
    id: identity.subject,
    role: roleClaim ? normalizeRole(roleClaim) : ANONYMOUS.role,
    tenantId: tenantClaim || ANONYMOUS.tenantId,
  };
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
