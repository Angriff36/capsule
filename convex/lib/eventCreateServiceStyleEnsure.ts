import { api } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

const BUILTIN_CODES = new Set([
  "full-service",
  "limited-service",
  "drop-off",
  "vending",
  "buffet-cook-onsite",
  "buffet-bring-hot",
  "plated",
  "family-style",
  "private-chef",
  "action-station",
  "ready-to-heat",
  "pickup",
]);

const BOOKING_ROLES = new Set([
  "sales_staff",
  "sales_manager",
  "event_staff",
  "event_manager",
  "manager",
  "admin",
  "owner",
  "system",
]);

export function canMaterializeBuiltInServiceStyle(role: string): boolean {
  return BOOKING_ROLES.has(role);
}

export function isBuiltInServiceStyleCode(code: string): boolean {
  return BUILTIN_CODES.has(code);
}

/**
 * Materializes a built-in catalog code as a consequence of booking
 * (convex/eventCreateCatalog.ts, BOOKING_ROLES). Booking roles do not hold the
 * ServiceStyle policies (eventManageAccess), so the generated commands run
 * through the tenant system runner in the caller's transaction (2026-09-29):
 * ServiceStyle_createViaRegister for a new code, ServiceStyle_register for a
 * row that was never registered, ServiceStyle_activate for an inactive one.
 */
export async function ensureBuiltInServiceStyleRow(
  ctx: MutationCtx,
  input: {
    tenantId: string;
    name: string;
    code: string;
    sortOrder: number;
    description?: string;
  },
): Promise<string> {
  const rows = await ctx.db
    .query("serviceStyles")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", input.tenantId))
    .collect();
  const existing = rows.find(
    (row) => row.deletedAt == null && row.code === input.code,
  );
  const system = TenantSystemCommandRunner.forTenant(
    ctx,
    input.tenantId,
  ).context;
  if (existing) {
    if (existing.registeredAt == null) {
      await system.runMutation(api.mutations.ServiceStyle_register, {
        docId: existing._id,
        version: existing.version,
        name: existing.name.trim() ? existing.name : input.name,
        code: existing.code,
        sortOrder: existing.sortOrder,
        description: existing.description ?? undefined,
      });
    } else if (existing.status !== "active") {
      await system.runMutation(api.mutations.ServiceStyle_activate, {
        docId: existing._id,
        version: existing.version,
      });
    }
    return existing._id;
  }
  const created = await system.runMutation(
    api.mutations.ServiceStyle_createViaRegister,
    {
      name: input.name,
      code: input.code,
      sortOrder: input.sortOrder,
      description: input.description,
    },
  );
  return String(created.docId);
}
