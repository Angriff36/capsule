import { ConvexError } from "convex/values";
import type { AppAuthContext } from "./authContext";
import { orgCapabilityDeniesAction } from "./orgCapabilityGate";

const KITCHEN_LOOKUP_ROLES = new Set([
  "admin",
  "owner",
  "system",
  "kitchen_lead",
  "kitchen_manager",
  "kitchen_staff",
]);

/** Match ingredient manifest kitchenAccess policy for lookup actions. */
export function requireKitchenAccess(auth: AppAuthContext) {
  if (!auth.tenantId || auth.role === "anonymous") {
    throw new ConvexError("Sign in to search the food database");
  }
  if (orgCapabilityDeniesAction("kitchenAccess", auth.disabledCapabilities)) {
    throw new ConvexError("Kitchen access is disabled for this organization");
  }
  if (!KITCHEN_LOOKUP_ROLES.has(auth.role)) {
    throw new ConvexError("Kitchen staff may use the food database lookup");
  }
}
