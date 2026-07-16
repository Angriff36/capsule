/**
 * Deterministic authenticated scenario for IngredientDemand_confirm → PurchaseNeed.
 * Capsule-owned fixture data — not a Manifest product decision.
 */

export const DEMAND_CONFIRM_SCENARIO = {
  tenantA: "tenant-proof-a",
  tenantB: "tenant-proof-b",
  allowedRole: "inventory_staff",
  deniedRole: "kitchen_staff",
  requiredQuantity: 4.5,
  unit: "kilogram" as const,
  ingredientName: "Proof Flour",
  eventTitle: "Proof Event",
} as const;

export type DemandConfirmScenario = typeof DEMAND_CONFIRM_SCENARIO;
