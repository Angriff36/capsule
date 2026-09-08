/**
 * Capsule / Convex auth-context seam for Builder preset assembly.
 *
 * Generated mutations/queries import getAuthContext from this path — they do
 * not embed identity logic. The seam maps Convex ctx.auth.getUserIdentity()
 * (+ custom claims) into Manifest { role, tenantId }. Author-customize claims
 * mapping for the real IdP; fail closed when unauthenticated.
 */

export const CONVEX_AUTH_CONTEXT_IMPORT = "./lib/authContext";
export const CONVEX_AUTH_CONTEXT_PATH = "convex/lib/authContext.ts";

/** Fail-closed getAuthContext module emitted beside Convex projection output. */
export function convexAuthContextSeamSource(): string {
  return '/**\n * AUTHOR SEAM — emitted by Builder convex-application preset.\n * Not Manifest domain logic. Do not inline identity into generated mutations.\n *\n * Maps Convex ctx.auth.getUserIdentity() (+ custom claims) to Manifest\n * { id, role, tenantId }. Unauthenticated callers get anonymous sentinels\n * that match no role list and no tenant row (fail closed).\n */\nimport type { Auth } from "convex/server";\n\nexport interface AppAuthContext {\n  id: string;\n  role: string;\n  tenantId: string;\n}\n\nconst ANONYMOUS: AppAuthContext = { id: "", role: "anonymous", tenantId: "" };\n\nexport async function getAuthContext(ctx: {\n  auth: Auth;\n}): Promise<AppAuthContext> {\n  const identity = await ctx.auth.getUserIdentity();\n  if (!identity) return ANONYMOUS;\n\n  const claims = identity as Record<string, unknown>;\n  const org =\n    typeof claims.o === "object" && claims.o !== null\n      ? (claims.o as Record<string, unknown>)\n      : undefined;\n\n  const roleClaim =\n    (typeof claims.role === "string" && claims.role) ||\n    (typeof org?.rol === "string" && org.rol) ||\n    "";\n  const tenantClaim =\n    (typeof claims.tenantId === "string" && claims.tenantId) ||\n    (typeof org?.id === "string" && org.id) ||\n    (typeof claims.org_id === "string" && claims.org_id) ||\n    "";\n\n  return {\n    id: identity.subject,\n    role: roleClaim ? normalizeRole(roleClaim) : ANONYMOUS.role,\n    tenantId: tenantClaim || ANONYMOUS.tenantId,\n  };\n}\n\n/** Strip IdP role namespaces (e.g. Clerk org:admin → admin) for Manifest guards. */\nfunction normalizeRole(role: string): string {\n  return role.startsWith("org:") ? role.slice(4) : role;\n}\n\nexport function requireTenant(auth: AppAuthContext): string {\n  if (!auth.tenantId) {\n    throw new Error("No tenant in authentication context");\n  }\n  return auth.tenantId;\n}\n';
}
