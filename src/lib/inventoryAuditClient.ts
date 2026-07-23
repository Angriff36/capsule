import { useAction } from "convex/react";
import { api } from "./api";

/**
 * Authored seam for the hand-written inventoryAudit Convex action.
 * Lives in src/lib (like manifest-convex-react.ts) because feature trees are
 * guarded against direct convex/react hook construction.
 */
export function useInventoryAuditForItem() {
  return useAction(api.inventoryAudit.listForItem);
}
