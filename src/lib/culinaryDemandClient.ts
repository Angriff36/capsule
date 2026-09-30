// Client seam for the authored convex/culinaryDemand.ts module. The Kitchen and
// Event feature roots may not construct Convex hooks themselves (Manifest
// integration guards), so the wrappers live here beside the other authored
// seams, the same way safeCulinaryOperations.ts holds the culinary operations.
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";
import { formatMoney } from "./format";

export const useEventDemandReview = (eventId: string, enabled = true) =>
  useQuery(
    api.culinaryDemand.eventDemandReview,
    enabled ? { eventId: eventId as Id<"events"> } : "skip",
  );

/** Same roles the server lets read demand reports (culinaryDemand.ts). */
export function canReadCulinaryDemand(role: string | null | undefined) {
  if (!role) return false;
  return (
    role === "kitchen_staff" ||
    role === "kitchen_lead" ||
    role === "inventory_staff" ||
    role === "procurement_staff" ||
    role === "manager" ||
    role.endsWith("_manager") ||
    role === "admin" ||
    role === "owner" ||
    role === "system"
  );
}

/** Same roles the server lets read an event's food cost (culinaryDemand.ts). */
export function canReadEventFoodCost(role: string | null | undefined) {
  return canReadCulinaryDemand(role) || role === "finance_staff";
}

/** Food cost priced at the event date, with its gaps; actuals for money readers. */
export const useEventFoodCost = (eventId: string, enabled = true) =>
  useQuery(
    api.culinaryDemand.eventFoodCostReport,
    enabled ? { eventId: eventId as Id<"events"> } : "skip",
  );

/** Plain words for what an event's food-cost estimate leaves out. Null when complete. */
export function foodCostGapText(estimated: {
  complete: boolean;
  unknownRows: number;
  unresolvedItems: number;
}): string | null {
  if (estimated.complete) return null;
  const parts: string[] = [];
  if (estimated.unknownRows)
    parts.push(
      `${estimated.unknownRows} ingredient amount${estimated.unknownRows === 1 ? " has" : "s have"} no price`,
    );
  if (estimated.unresolvedItems)
    parts.push(
      `${estimated.unresolvedItems} menu item${estimated.unresolvedItems === 1 ? " can't" : "s can't"} be worked out yet`,
    );
  if (!parts.length) return "No menu food to cost yet.";
  return `Food cost is not complete: ${parts.join(" and ")}. The real cost is higher, so the margin shown is too high.`;
}

/** Why an ingredient amount has no cost, in kitchen words. */
export function foodCostReasonText(reason: string | null): string {
  if (reason === "priced at $0") return "price is $0";
  if (reason === "no price" || reason == null) return "no price yet";
  if (reason === "ingredient not found") return "removed from the book";
  return "amount can't be matched to how it is priced";
}

/** Where a known price came from, in plain words. */
export function priceSourceText(line: {
  priceSource: string | null;
  priceEffectiveAt: number | null;
}): string {
  if (line.priceSource === "receipt" && line.priceEffectiveAt != null)
    return `Receipt price from ${new Date(line.priceEffectiveAt).toLocaleDateString()}`;
  if (line.priceSource === "catalog") return "Catalog price (no date)";
  return "No price";
}

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
  undatedLines?: number;
}): string {
  const known = cost.totalLines - cost.unknownLines;
  if (cost.confidence === "none")
    return `Cost unknown · ${known} of ${cost.totalLines} lines priced`;
  const undated = cost.undatedLines
    ? ` · ${cost.undatedLines} from catalog prices with no date`
    : "";
  return `Known subtotal ${formatMoney(cost.knownSubtotal)} for ${known} of ${cost.totalLines} lines · ${costConfidenceText(cost.confidence).toLowerCase()}${undated}`;
}
