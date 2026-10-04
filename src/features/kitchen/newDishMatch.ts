// New dish form (Ryan 2026-10-04): most duplicate dishes were the same food
// typed again with a serving tag ("Carne Asada (SEL)", "Carne Asada -
// passed"). The name check compares names with those tags taken off.

const TAG_WORDS =
  "sel|passed|drop[ -]?off|individual|vending|finish at (?:event|kitchen)|action station|day of";
const SERVING_TAG = new RegExp(
  `\\s*(?:-\\s*(?:${TAG_WORDS})|\\((?:${TAG_WORDS})\\))\\s*$`,
  "i",
);

/** The food a dish name names, without serving tags, case or punctuation. */
export function dishFoodKey(name: string): string {
  let n = name.trim();
  for (let i = 0; i < 4 && SERVING_TAG.test(n); i++)
    n = n.replace(SERVING_TAG, "");
  return n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type MatchRow = {
  _id: string;
  name: string;
  deletedAt?: number | null;
  mergedIntoDishId?: string | null;
};

export type DishMatch<T> = { dish: T; sameFood: boolean };

/**
 * Dishes on file that look like the typed name: the same food first, then
 * names that contain it (or that it contains). Deleted and merged dishes are
 * left out.
 */
export function findDishMatches<T extends MatchRow>(
  rows: readonly T[],
  typed: string,
  limit = 5,
): DishMatch<T>[] {
  const key = dishFoodKey(typed);
  if (key.length < 3) return [];
  return rows
    .filter((row) => row.deletedAt == null && row.mergedIntoDishId == null)
    .map((row) => {
      const rowKey = dishFoodKey(row.name);
      let score = 0;
      if (rowKey === key) score = 3;
      else if (
        rowKey.startsWith(key) ||
        (rowKey.length >= 4 && key.startsWith(rowKey))
      )
        score = 2;
      else if (key.length >= 4 && rowKey.includes(key)) score = 1;
      return { row, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .slice(0, limit)
    .map(({ row, score }) => ({ dish: row, sameFood: score === 3 }));
}

/** Values used on dishes, most used first (first spelling seen wins). */
export function valuesByUse(values: Iterable<string | null | undefined>) {
  const counts = new Map<string, { label: string; count: number }>();
  for (const raw of values) {
    const label = raw?.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const current = counts.get(key);
    counts.set(key, {
      label: current?.label ?? label,
      count: (current?.count ?? 0) + 1,
    });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((entry) => entry.label);
}

// Timing and serving words in old catalog categories ("Apps - Passed -
// Finish at Event"). They have their own sections on the new dish form.
const NOT_A_MENU_CATEGORY =
  /^(?:finish at (?:event|kitchen)|day of|passed|drop ?off|vending|action station|buffet.*|plated|family style|individual|sel\s*\d*|ready to heat|air catering)$/i;

/** Real menu categories (Apps, Entree, Pizza...) from catalog categories. */
export function menuCategory(category: string | null | undefined) {
  const part = (category ?? "")
    .split(/\s+-\s+/)
    .map((piece) => piece.trim())
    .find((piece) => piece && !NOT_A_MENU_CATEGORY.test(piece));
  return part || undefined;
}

/** The common diet tags, written one way ("gluten free" -> "gluten-free"). */
export function dietTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s*-?\s*free$/, "-free")
    .replace(/\s+/g, " ");
}
