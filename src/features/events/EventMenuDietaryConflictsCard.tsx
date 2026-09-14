import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  avoidTermsFromGuestRestrictions,
  crossCheckMenu,
  describeOrigin,
  extractAvoidTermsFromText,
  type AvoidTerm,
  type DietaryConflict,
  type DishTextSource,
} from "./eventDietaryCrossCheck";

type DishRow = {
  _id: string;
  name: string;
  description?: string | null;
  recipeInstructions?: string | null;
  /** Allergen codes (`tree_nuts`, `crustacean_shellfish`, …) — a list, not prose. */
  allergenSummary?: readonly string[] | string | null;
  dietaryTags?: readonly string[] | null;
};

/**
 * Allergen codes as words the text matcher can read: "tree_nuts" → "tree nuts".
 * The catalog stores a list; a plain string is tolerated in case older rows
 * or a hand-written caller pass one.
 */
export function allergenSummaryText(
  summary: DishRow["allergenSummary"],
): string {
  const codes = Array.isArray(summary)
    ? summary
    : typeof summary === "string"
      ? [summary]
      : [];
  return codes
    .map((code) => String(code).replaceAll("_", " ").trim())
    .filter(Boolean)
    .join(", ");
}

type LinkRow = { dishId: string; deletedAt?: number | null };

export type DietaryConflictInputs = {
  eventId: string;
  event:
    | {
        serviceRequirements?: string | null;
        operationalRequirements?: string | null;
        notes?: string | null;
      }
    | null
    | undefined;
  guests: readonly {
    eventId: string;
    name: string;
    allergenRestrictions?: readonly string[] | null;
    dietaryRestrictions?: readonly string[] | null;
    deletedAt?: number | null;
  }[];
  selections: readonly { _id: string; dishId: string }[];
  dishes: readonly DishRow[] | undefined;
  dishIngredients: readonly (LinkRow & { ingredientId: string })[];
  dishComponents: readonly (LinkRow & { componentId: string })[];
  componentIngredients: readonly {
    componentId: string;
    ingredientId: string;
    deletedAt?: number | null;
  }[];
  ingredients: readonly { _id: string; name: string }[];
  components: readonly { _id: string; name: string }[];
};

/** The event's "must not contain" list, from its text and its guest list. */
export function eventAvoidTerms(inputs: DietaryConflictInputs): AvoidTerm[] {
  const fromText = [
    ...extractAvoidTermsFromText(inputs.event?.serviceRequirements, {
      kind: "service_requirements",
    }),
    ...extractAvoidTermsFromText(inputs.event?.operationalRequirements, {
      kind: "operational_requirements",
    }),
    ...extractAvoidTermsFromText(inputs.event?.notes, {
      kind: "operational_requirements",
    }),
  ];
  const guests = inputs.guests.filter(
    (guest) => guest.eventId === inputs.eventId && guest.deletedAt == null,
  );
  return [...fromText, ...avoidTermsFromGuestRestrictions(guests)];
}

/** Everything the catalog says about each dish on this menu, labelled by source. */
export function menuDishTextSources(
  inputs: DietaryConflictInputs,
): DishTextSource[] {
  const ingredientName = new Map(
    inputs.ingredients.map((row) => [row._id, row.name]),
  );
  const componentName = new Map(
    inputs.components.map((row) => [row._id, row.name]),
  );
  const componentIngredientIds = new Map<string, string[]>();
  for (const row of inputs.componentIngredients) {
    if (row.deletedAt != null) continue;
    const list = componentIngredientIds.get(row.componentId) ?? [];
    list.push(row.ingredientId);
    componentIngredientIds.set(row.componentId, list);
  }
  return inputs.selections.flatMap((selection) => {
    const dish = inputs.dishes?.find((row) => row._id === selection.dishId);
    if (!dish) return [];
    const texts: { label: string; text: string }[] = [];
    if (dish.description)
      texts.push({ label: "description", text: dish.description });
    const allergenText = allergenSummaryText(dish.allergenSummary);
    if (allergenText) {
      texts.push({ label: "allergen summary", text: allergenText });
    }
    for (const link of inputs.dishIngredients) {
      if (link.dishId !== dish._id || link.deletedAt != null) continue;
      const name = ingredientName.get(link.ingredientId);
      if (name) texts.push({ label: "ingredient", text: name });
    }
    for (const link of inputs.dishComponents) {
      if (link.dishId !== dish._id || link.deletedAt != null) continue;
      const name = componentName.get(link.componentId);
      if (name) texts.push({ label: "component", text: name });
      for (const ingredientId of componentIngredientIds.get(link.componentId) ??
        []) {
        const ingredient = ingredientName.get(ingredientId);
        if (ingredient) {
          texts.push({
            label: `${name ?? "component"} ingredient`,
            text: ingredient,
          });
        }
      }
    }
    if (dish.recipeInstructions) {
      texts.push({ label: "recipe", text: dish.recipeInstructions });
    }
    return [
      { dishId: dish._id, lineId: selection._id, dishName: dish.name, texts },
    ];
  });
}

/**
 * Cross-checks the event's stated allergies / "NO ONIONS" style requirements
 * against what the catalog says is in each dish on the menu (#368 item 14).
 * Text matching against descriptions, ingredient and component names — a
 * review list for a human, not a verdict.
 */
export function EventMenuDietaryConflictsCard({
  inputs,
  onNoteLine,
  busy,
}: {
  inputs: DietaryConflictInputs;
  /** Opens the per-line note editor pre-filled with the conflict text. */
  onNoteLine: (lineId: string, suggestedNote: string) => void;
  busy: boolean;
}) {
  const avoid = useMemo(() => eventAvoidTerms(inputs), [inputs]);
  const conflicts = useMemo(
    () => crossCheckMenu(avoid, menuDishTextSources(inputs)),
    [avoid, inputs],
  );
  if (avoid.length === 0) return null;

  const termList = [...new Set(avoid.map((term) => term.term))].join(", ");
  return (
    <section
      className={`card p-4 ${conflicts.length > 0 ? "border-warn/40 bg-warn-soft" : ""}`}
      data-testid="event-menu-dietary-conflicts"
    >
      <p className="eyebrow">Dietary cross-check</p>
      <p className="mt-1 text-sm text-ink-2">
        This event says to avoid{" "}
        <strong className="text-ink">{termList}</strong> (
        {[...new Set(avoid.map((term) => describeOrigin(term.origin)))].join(
          "; ",
        )}
        ).
      </p>
      {conflicts.length === 0 ? (
        <p
          className="mt-2 text-sm text-ok"
          data-testid="dietary-conflicts-clear"
        >
          No dish on this menu lists any of those in its description,
          ingredients or components.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" data-testid="dietary-conflicts-list">
          {conflicts.map((conflict) => (
            <ConflictRow
              key={`${conflict.lineId}-${conflict.term}-${describeOrigin(conflict.origin)}`}
              conflict={conflict}
              busy={busy}
              onNoteLine={onNoteLine}
            />
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Matches words in the catalog record, so a dish that is already made
        without the item can still appear here — that is what the note is for.
        Missing ingredients on a dish are not checked; fill in the recipe in
        Kitchen → Dishes to make this stricter.
      </p>
    </section>
  );
}

function ConflictRow({
  conflict,
  busy,
  onNoteLine,
}: {
  conflict: DietaryConflict;
  busy: boolean;
  onNoteLine: (lineId: string, suggestedNote: string) => void;
}) {
  const suggested = `${capitalize(conflict.term)} — event requirement (${describeOrigin(conflict.origin)}). Catalog ${conflict.evidence}. Confirm omitted or swap the dish.`;
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-warn/40 bg-panel px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">
          {conflict.dishName}{" "}
          <span className="font-normal text-ink-2">
            may contain {conflict.term}
          </span>
        </p>
        <p className="text-xs text-ink-3">
          Catalog {conflict.evidence} · {describeOrigin(conflict.origin)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={busy}
          onClick={() => onNoteLine(conflict.lineId, suggested)}
          data-testid="dietary-conflict-note"
        >
          Note it on the line
        </button>
        <Link
          to={`/kitchen/dishes/${conflict.dishId}`}
          target="_blank"
          rel="noopener"
          className="text-xs text-brand underline"
        >
          Catalog record ↗
        </Link>
      </div>
    </li>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
