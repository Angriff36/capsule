import type { MutationCtx } from "../_generated/server";

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
  const now = Date.now();
  if (existing) {
    if (existing.status !== "active" || existing.registeredAt == null) {
      await ctx.db.patch(existing._id, {
        status: "active",
        registeredAt: existing.registeredAt ?? now,
        deactivatedAt: undefined,
        deactivationReason: undefined,
        updatedAt: now,
        version: existing.version + 1,
      });
    }
    return existing._id;
  }
  return await ctx.db.insert("serviceStyles", {
    tenantId: input.tenantId,
    name: input.name,
    code: input.code,
    sortOrder: input.sortOrder,
    description: input.description,
    status: "active",
    registeredAt: now,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
}
