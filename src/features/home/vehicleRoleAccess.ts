/** Roles the Delivery vehicle assign/unassign seam accepts
 *  (convex/vehicleAssignment.ts). Kitchen and sales staff can see the
 *  calendar popup but must not be offered a control that will policy-deny. */
const VEHICLE_ASSIGN_ROLES = new Set([
  "logistics_staff",
  "driver",
  "logistics_manager",
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

export function canAssignDeliveryVehicle(role: string | undefined): boolean {
  return VEHICLE_ASSIGN_ROLES.has(role ?? "");
}
