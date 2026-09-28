// Plain kitchen sentences for the demand engine's unresolved items (PR03-08).
// The engine's label/detail are a working ledger (ids, unit codes); screens
// show this sentence instead: names, what is missing, and what still works.
import type { DemandLookups, UnresolvedItem } from "./demand";

type NameLookups = Pick<DemandLookups, "components" | "dishes"> & {
  /** Names of removed records, read by the query for missing references. */
  removedNames?: ReadonlyMap<string, string>;
};

/** Drops the trailing converter code, e.g. " (no_density)". */
const withoutCode = (detail: string) =>
  detail.replace(/\s*\([a-z_]+\)\s*$/, "");

/** "2 cup" -> "2 cups", "1 fluid_ounce" -> "1 fluid ounce". */
function amount(text: string): string {
  const match = text.match(/^([\d.]+)\s+([a-z_]+)$/);
  if (!match) return text.replace(/_/g, " ");
  return `${match[1]} ${unitWord(match[2], Number(match[1]))}`;
}

function unitWord(unit: string, quantity = 1): string {
  const word = unit.replace(/_/g, " ");
  if (quantity === 1 || word === "each" || word.endsWith("s")) return word;
  return word.endsWith("ch") ? `${word}es` : `${word}s`;
}

export function unresolvedText(
  item: UnresolvedItem,
  lookups: NameLookups,
): string {
  const dish = lookups.dishes.get(item.dishId)?.name;
  const onDish = dish ? ` on ${dish}` : "";
  const removed = lookups.removedNames?.get(item.refId);
  switch (item.kind) {
    case "cycle": {
      const ids = item.detail.replace(/^recipe cycle:\s*/, "").split(" -> ");
      const name = (id: string) =>
        lookups.components.get(id)?.name ?? "a removed recipe";
      const steps = ids
        .slice(0, -1)
        .map((id, index) => `${name(id)} uses ${name(ids[index + 1])}`);
      return `${item.label} ends up inside itself: ${steps.join(", and ")}. Take one of those sub-recipes out. Until then nothing from this recipe is counted for ordering.`;
    }
    case "recipe_content":
      if (item.detail === "recipe method not on file")
        return `${item.label} has its ingredients but no method written yet. Its ingredients are still counted, and cooks can still do the task.`;
      return `${item.label} has no ingredient list${item.detail.includes("no method") ? " and no method" : ""} on file yet, so none of its ingredients are counted for ordering. Cooks can still see and do the task.`;
    case "missing_reference": {
      if (item.detail === "dish not found")
        return `${removed ?? "A dish"} was removed from the dish list, so nothing is counted for it on this event.`;
      const what =
        item.detail === "sub-recipe not found"
          ? "sub-recipe"
          : item.detail === "recipe not found"
            ? "recipe"
            : "ingredient";
      const where = what === "ingredient" ? "ingredient list" : "recipe book";
      return removed
        ? `${removed}, a ${what} used${onDish}, was removed from the ${where}, so it is not counted. The rest of the dish is.`
        : `A ${what} used${onDish} was removed from the ${where} and its name is no longer on file, so it is not counted. The rest of the dish is.`;
    }
    case "unit": {
      const detail = withoutCode(item.detail);
      const bought = detail.match(/^(.+?) cannot convert to catalog unit (.+)$/);
      if (bought) {
        const unit = bought[1].split(" ").pop() ?? "";
        return `${item.label}: the recipe asks for ${amount(bought[1])}, but it is bought by the ${unitWord(bought[2])}. Add how many ${unitWord(unit, 2)} make one ${unitWord(bought[2])} so it can be counted.`;
      }
      const made = detail.match(/^(.+?) of .+ cannot convert to its yield unit (.+)$/);
      if (made)
        return `${item.label}: the recipe asks for ${amount(made[1])}, but this recipe makes its batch in ${unitWord(made[2], 2)}. Add a conversion so it can be counted.`;
      const batches = detail.match(/^cannot express (.+?) of .+ in batches$/);
      if (batches)
        return `${item.label}: ${amount(batches[1])} can't be turned into whole batches of this recipe. Add a conversion so it can be counted.`;
      return `${item.label}: this amount can't be converted yet. Add a conversion so it can be counted.`;
    }
    case "basis":
      return item.detail.includes("cooked weight")
        ? `${item.label}: the amount is a cooked weight and no cooked yield is set, so the raw amount to buy is not known yet.`
        : `${item.label}: the recipe does not say if the amount is raw or cooked, so the amount to buy is not known yet.`;
    case "choice_pending": {
      const options = item.detail.replace(/^choose:\s*/, "");
      return `${item.label}: pick ${options.split(" / ").join(" or ")} before it is counted.`;
    }
    case "supply_kind":
      return `${item.label} is not a food item, so it adds nothing to the food order.`;
  }
}

/** Adds the plain sentence to each item, for the read queries. */
export function withUnresolvedText<T extends UnresolvedItem>(
  items: T[],
  lookups: NameLookups,
): T[] {
  return items.map((item) => ({ ...item, text: unresolvedText(item, lookups) }));
}
