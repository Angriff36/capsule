import {
  culinaryCanonicalMatcher,
  type CanonicalLike,
} from "../kitchen/CulinaryCanonicalMatcher";
import {
  SELECTABLE_UNITS,
  type UnitOfMeasure,
} from "../kitchen/import/UnitOfMeasureMapper";

export type EventMenuRecipeIngredientOption = {
  id: string;
  name: string;
  unit?: string | null;
  deletedAt?: unknown;
  status?: string | null;
  canonicalIngredientId?: string | null;
  mergedIntoIngredientId?: string | null;
};

export type EventMenuCreateIngredientInput = {
  name: string;
  unit: UnitOfMeasure;
  costPerUnit: number;
};

export type EventMenuCreateIngredientParse =
  | { ok: true; value: EventMenuCreateIngredientInput }
  | { ok: false; error: string };

function asCanonical(
  row: EventMenuRecipeIngredientOption,
): CanonicalLike & { unit?: string | null } {
  return {
    _id: row.id,
    name: row.name,
    deletedAt: row.deletedAt as number | null | undefined,
    status: row.status ?? undefined,
    canonicalIngredientId: row.canonicalIngredientId,
    mergedIntoIngredientId: row.mergedIntoIngredientId,
    unit: row.unit,
  };
}

/** Search the live catalog. Empty query returns no rows so the picker is not a dump. */
export function filterEventMenuRecipeIngredients(
  ingredients: readonly EventMenuRecipeIngredientOption[],
  query: string,
  limit = 12,
): EventMenuRecipeIngredientOption[] {
  const records = ingredients.map(asCanonical);
  return culinaryCanonicalMatcher
    .findNameMatches(records, query, limit)
    .map((row) => ({
      id: row._id,
      name: row.name,
      unit: row.unit,
    }));
}

/** Prefer an explicit pick; otherwise accept an exact catalog name typed in search. */
export function resolveEventMenuRecipeIngredientId(
  ingredients: readonly EventMenuRecipeIngredientOption[],
  selectedId: string,
  query: string,
): string | null {
  if (selectedId) return selectedId;
  const exact = culinaryCanonicalMatcher.likelyDuplicate(
    ingredients.map(asCanonical),
    query,
  );
  return exact?._id ?? null;
}

/** Empty or blank cost is $0. Never invent a catalog dollar. */
export function parseEventMenuCreateIngredientCost(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function parseEventMenuCreateIngredient(input: {
  name: string;
  unit: string;
  costRaw: string;
}): EventMenuCreateIngredientParse {
  const name = String(input.name ?? "").trim();
  if (!name) {
    return { ok: false, error: "Ingredient name is required." };
  }
  const unit = String(input.unit ?? "").trim() as UnitOfMeasure;
  if (!SELECTABLE_UNITS.includes(unit)) {
    return { ok: false, error: "Pick a stock unit for the new ingredient." };
  }
  const costPerUnit = parseEventMenuCreateIngredientCost(input.costRaw);
  if (costPerUnit == null) {
    return {
      ok: false,
      error: "Catalog cost must be $0 or a non-negative amount.",
    };
  }
  return { ok: true, value: { name, unit, costPerUnit } };
}

export function createdIngredientId(result: unknown): string | null {
  if (result == null || typeof result !== "object") return null;
  const record = result as { docId?: unknown; _id?: unknown };
  const id = record.docId ?? record._id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
