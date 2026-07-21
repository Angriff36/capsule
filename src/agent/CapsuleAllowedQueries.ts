import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";

type AnyQueryRef = FunctionReference<"query">;

/**
 * Allowlisted Convex queries agents may read through Capsule MCP.
 * Do not expose the full query surface — only cascade / kitchen verification reads.
 */
export const CAPSULE_ALLOWED_QUERIES = {
  listIngredientDemandByEventId: {
    ref: api.queries.listIngredientDemandByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listIngredientDemandByPurchaseEligibleEventId: {
    ref: api.queries
      .listIngredientDemandByPurchaseEligibleEventId as AnyQueryRef,
    requiredArgs: ["purchaseEligibleEventId"] as const,
  },
  listPrepTaskByEventId: {
    ref: api.queries.listPrepTaskByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listPurchaseNeedByEventId: {
    ref: api.queries.listPurchaseNeedByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listVendorOrder: {
    ref: api.queries.listVendorOrder as AnyQueryRef,
    requiredArgs: [] as const,
  },
  listVendorOrderLineByIngredientId: {
    ref: api.queries.listVendorOrderLineByIngredientId as AnyQueryRef,
    requiredArgs: ["ingredientId"] as const,
  },
  listVendorOrderLineByVendorOrderId: {
    ref: api.queries.listVendorOrderLineByVendorOrderId as AnyQueryRef,
    requiredArgs: ["vendorOrderId"] as const,
  },
  listWeeklyPurchasingConfig: {
    ref: api.queries.listWeeklyPurchasingConfig as AnyQueryRef,
    requiredArgs: [] as const,
  },
  listPackListByEventId: {
    ref: api.queries.listPackListByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listProductionBatchByEventId: {
    ref: api.queries.listProductionBatchByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listDeliveryByEventId: {
    ref: api.queries.listDeliveryByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listEventCloseoutByEventId: {
    ref: api.queries.listEventCloseoutByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
  listEventAssignmentByEventId: {
    ref: api.queries.listEventAssignmentByEventId as AnyQueryRef,
    requiredArgs: ["eventId"] as const,
  },
} as const;

export type CapsuleAllowedQueryName = keyof typeof CAPSULE_ALLOWED_QUERIES;

export const CAPSULE_ALLOWED_QUERY_NAMES = Object.keys(
  CAPSULE_ALLOWED_QUERIES,
) as CapsuleAllowedQueryName[];
