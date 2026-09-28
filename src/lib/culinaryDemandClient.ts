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

/** Events a publish of this recipe reaches, and finished events that keep theirs. */
export const useRecipeEditionImpact = (componentId: string) =>
  useQuery(api.culinaryDemandSweep.recipeEditionImpact, {
    componentId: componentId as Id<"components">,
  });

/** Publish a recipe and save the edition events use while it is a draft again. */
export function usePublishRecipeEdition() {
  const mutate = useMutation(api.culinaryDemandSweep.publishRecipeEdition);
  return (componentId: string, version?: number) =>
    mutate({ componentId: componentId as Id<"components">, version });
}

/** Plain words for who a publish reaches. */
export function recipeEditionImpactText(impact: {
  following: unknown[];
  keeping: unknown[];
}): string | null {
  const events = (n: number) => (n === 1 ? "1 event" : `${n} events`);
  const parts: string[] = [];
  if (impact.following.length)
    parts.push(
      `${events(impact.following.length)} not finished yet use this recipe as published.`,
    );
  if (impact.keeping.length)
    parts.push(
      `${events(impact.keeping.length)} already finished keep what they were made with.`,
    );
  return parts.length ? parts.join(" ") : null;
}

/** Kitchen wording for each unresolved kind the demand engine reports. */
export const UNRESOLVED_KIND_LABEL: Record<string, string> = {
  unit: "Amount can't be converted",
  basis: "Raw or cooked amount not known",
  recipe_content: "Recipe not written yet",
  choice_pending: "Choice to make",
  cycle: "Recipe inside itself",
  missing_reference: "Removed from the book",
  supply_kind: "Not food",
};

export const unresolvedKindLabel = (kind: string): string =>
  UNRESOLVED_KIND_LABEL[kind] ?? "Needs attention";

/** The sentence a screen shows for one unresolved item. */
export const unresolvedItemText = (item: {
  label: string;
  detail: string;
  text?: string;
}): string => item.text ?? `${item.label} — ${item.detail}`;

/** Kitchen words for how much of a recipe's cost is known. */
export function costConfidenceText(confidence: string): string {
  if (confidence === "complete") return "Fully priced";
  if (confidence === "partial") return "Partly priced";
  return "Not priced";
}

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
  return `Known subtotal ${formatMoney(cost.knownSubtotal)} for ${known} of ${cost.totalLines} lines · ${costConfidenceText(cost.confidence).toLowerCase()}`;
}
