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
  return {
    id: identity.subject,
    role:
      typeof claims.role === "string" && claims.role !== ""
        ? normalizeRole(claims.role)
        : ANONYMOUS.role,
    tenantId:
      typeof claims.tenantId === "string"
        ? claims.tenantId
        : ANONYMOUS.tenantId,
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
