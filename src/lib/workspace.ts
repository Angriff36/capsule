// Workspace context. Real identity (user, role, tenant) comes only from the
// verified server-side auth context once the Clerk + Convex integration is
// configured (see AGENTS.md "Authentication"). There is no development
// identity fallback.

/** Placeholder for generated create-command validators that still require a
 *  `tenantId` argument. The patched backend IGNORES this value and derives
 *  the tenant from the verified identity. */
export const TENANT_PLACEHOLDER = "ignored-server-derives-tenant";

export const WORKSPACE_NAME = "Capsule Catering Co.";
