/**
 * Deterministic authenticated scenario for QualityCheck_fail → PrepTask.markBlocked.
 * Capsule-owned fixture data — not a Manifest product decision.
 */

export const QUALITY_FAIL_BLOCK_SCENARIO = {
  tenantA: "tenant-quality-a",
  tenantB: "tenant-quality-b",
  /** Has kitchenAccess + kitchenLeadAccess so the reaction can markBlocked. */
  allowedRole: "kitchen_lead",
  /** Has kitchenAccess but not kitchenLeadAccess — reaction must fail closed. */
  deniedRole: "kitchen_staff",
  quantity: 3,
  unit: "kilogram" as const,
  ingredientName: "Proof Butter",
  eventTitle: "Quality Proof Event",
  station: "pastry",
} as const;

export type QualityFailBlockScenario = typeof QUALITY_FAIL_BLOCK_SCENARIO;
