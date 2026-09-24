import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";

type AnyQueryRef = FunctionReference<"query">;

/**
 * Cascade reads an agent may run. Required arguments, kind, and client
 * visibility come from the generated wiring read catalog — not this list.
 * Do not expose the full query surface.
 */
export const CAPSULE_ALLOWED_QUERIES = {
  listIngredientDemandByEventId: {
    ref: api.queries.listIngredientDemandByEventId as AnyQueryRef,
  },
  listIngredientDemandByPurchaseEligibleEventId: {
    ref: api.queries
      .listIngredientDemandByPurchaseEligibleEventId as AnyQueryRef,
  },
  listPrepTaskByEventId: {
    ref: api.queries.listPrepTaskByEventId as AnyQueryRef,
  },
  listPurchaseNeedByEventId: {
    ref: api.queries.listPurchaseNeedByEventId as AnyQueryRef,
  },
  listVendorOrder: {
    ref: api.queries.listVendorOrder as AnyQueryRef,
  },
  getVendorOrder: {
    ref: api.queries.getVendorOrder as AnyQueryRef,
  },
  listVendorOrderLineByIngredientId: {
    ref: api.queries.listVendorOrderLineByIngredientId as AnyQueryRef,
  },
  listVendorOrderLineByVendorOrderId: {
    ref: api.queries.listVendorOrderLineByVendorOrderId as AnyQueryRef,
  },
  listWeeklyPurchasingConfig: {
    ref: api.queries.listWeeklyPurchasingConfig as AnyQueryRef,
  },
  listPackListByEventId: {
    ref: api.queries.listPackListByEventId as AnyQueryRef,
  },
  listProductionBatchByEventId: {
    ref: api.queries.listProductionBatchByEventId as AnyQueryRef,
  },
  listDeliveryByEventId: {
    ref: api.queries.listDeliveryByEventId as AnyQueryRef,
  },
  listEventCloseoutByEventId: {
    ref: api.queries.listEventCloseoutByEventId as AnyQueryRef,
  },
  listEventAssignmentByEventId: {
    ref: api.queries.listEventAssignmentByEventId as AnyQueryRef,
  },
} as const;

export type CapsuleAllowedQueryName = keyof typeof CAPSULE_ALLOWED_QUERIES;

export const CAPSULE_ALLOWED_QUERY_NAMES = Object.keys(
  CAPSULE_ALLOWED_QUERIES,
) as CapsuleAllowedQueryName[];
