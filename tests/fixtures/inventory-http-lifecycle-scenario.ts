/**
 * Deterministic quantities for the authenticated inventory HTTP lifecycle proof.
 * Capsule-owned fixture data — not a Manifest product decision.
 */

export const INVENTORY_HTTP_LIFECYCLE = {
  tenantId: "tenant-inventory-http-lifecycle",
  role: "inventory_staff",
  eventManagerRole: "event_manager",
  salesRole: "sales_manager",
  kitchenRole: "kitchen_manager",
  unit: "kilogram" as const,
  initialDemand: 10,
  increasedDemand: 16,
  onHand: 30,
  ingredientName: "HTTP lifecycle flour",
  eventTitle: "HTTP inventory lifecycle event",
  startsAt: Date.UTC(2026, 7, 20, 17, 0),
  endsAt: Date.UTC(2026, 7, 20, 23, 0),
} as const;

export type InventoryHttpLifecycleScenario = typeof INVENTORY_HTTP_LIFECYCLE;
