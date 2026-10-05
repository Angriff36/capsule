// Client seam for the authored convex/culinaryDemand.ts module. The Kitchen and
// Event feature roots may not construct Convex hooks themselves (Manifest
// integration guards), so the wrappers live here beside the other authored
// seams, the same way safeCulinaryOperations.ts holds the culinary operations.
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";
import { formatMoney } from "./format";

export const useEventDemandReview = (eventId: string) =>
  useQuery(api.culinaryDemand.eventDemandReview, {
    eventId: eventId as Id<"events">,
  });

export const useComponentContentReport = (componentId: string) =>
  useQuery(api.culinaryDemand.componentContentReport, {
    componentId: componentId as Id<"components">,
  });

export const useKitchenUnresolvedReport = () =>
  useQuery(api.culinaryDemand.kitchenUnresolvedReport, {});

export function useReconcileEventDemand() {
  const mutate = useMutation(api.culinaryDemand.reconcileEventDemand);
  return (eventId: string) => mutate({ eventId: eventId as Id<"events"> });
}

export type DemandChangeRequest = {
  eventId: string;
  kind: "recalculate" | "headcount" | "supersede";
  newHeadcount?: number;
  demandId?: string;
};

export function useDemandChangePreview(request: DemandChangeRequest) {
  return useQuery(api.culinaryDemand.previewDemandChange, {
    eventId: request.eventId as Id<"events">,
    kind: request.kind,
    newHeadcount: request.newHeadcount,
    demandId: request.demandId as Id<"ingredientDemands"> | undefined,
  });
}

export function useApplyDemandRecalculation() {
  const mutate = useMutation(api.culinaryDemand.applyDemandRecalculation);
  return (eventId: string, expectedFingerprint: string) =>
    mutate({ eventId: eventId as Id<"events">, expectedFingerprint });
}

export function useApplyDemandHeadcount() {
  const mutate = useMutation(api.culinaryDemand.applyDemandHeadcount);
  return (args: {
    eventId: string;
    newHeadcount: number;
    version?: number;
    expectedFingerprint: string;
  }) =>
    mutate({
      ...args,
      eventId: args.eventId as Id<"events">,
    });
}

export function useApplyDemandSupersede() {
  const mutate = useMutation(api.culinaryDemand.applyDemandSupersede);
  return (args: {
    eventId: string;
    demandId: string;
    version?: number;
    reason: string;
    expectedFingerprint: string;
  }) =>
    mutate({
      ...args,
      eventId: args.eventId as Id<"events">,
      demandId: args.demandId as Id<"ingredientDemands">,
    });
}

export function useAddNestedRecipeLine() {
  const mutate = useMutation(api.culinaryDemand.addNestedRecipeLine);
  return (args: {
    componentId: string;
    childComponentId: string;
    quantity: number;
    unit: string;
    sortOrder?: number;
  }) =>
    mutate({
      ...args,
      componentId: args.componentId as Id<"components">,
      childComponentId: args.childComponentId as Id<"components">,
    });
}

export function useReconcileLiveEventsForComponent() {
  const mutate = useMutation(
    api.culinaryDemandSweep.reconcileLiveEventsForComponent,
  );
  return async (componentId: string) => {
    let cursor = 0;
    for (;;) {
      const page = await mutate({
        componentId: componentId as Id<"components">,
        cursor,
      });
      if (!page.hasMore) return page;
      cursor = page.nextCursor;
    }
  };
}

/** Kitchen wording for each unresolved kind the demand engine reports. */
export const UNRESOLVED_KIND_LABEL: Record<string, string> = {
  unit: "Unit not mapped",
  basis: "Yield not confirmed",
  recipe_content: "Recipe not on file",
  choice_pending: "Choice pending",
  cycle: "Recipe cycle",
  missing_reference: "Missing reference",
  supply_kind: "Supply, no food demand",
};

export const unresolvedKindLabel = (kind: string): string =>
  UNRESOLVED_KIND_LABEL[kind] ?? "Needs attention";

/** Kitchen wording for the recipe content status. */
export const RECIPE_CONTENT_STATUS_LABEL: Record<string, string> = {
  complete: "Complete",
  method_missing: "Method not on file",
  ingredients_missing: "Ingredients not on file",
  both_missing: "No ingredients and no method on file",
};

export const recipeContentStatusLabel = (status: string): string =>
  RECIPE_CONTENT_STATUS_LABEL[status] ?? "Unknown";

/** Cost summary line. A recipe with no known price reads "cost unknown",
 *  never a bare $0.00 that looks like a free recipe. */
export function recipeCostLine(cost: {
  confidence: string;
  knownSubtotal: number;
  unknownLines: number;
  totalLines: number;
}): string {
  const known = cost.totalLines - cost.unknownLines;
  if (cost.confidence === "none")
    return `Cost unknown · ${known} of ${cost.totalLines} lines priced`;
  return `Known subtotal ${formatMoney(cost.knownSubtotal)} for ${known} of ${cost.totalLines} lines · confidence ${cost.confidence}`;
}
