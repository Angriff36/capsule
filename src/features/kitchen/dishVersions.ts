// Versions (Ryan 2026-10-04): one food made different ways ("Finish at
// Kitchen", "Drop Off"...) is one main dish with its versions as tabs. Each
// version is a full dish row that points at its main dish.

export type VersionedDish = {
  _id: string;
  name: string;
  versionOfDishId?: string | null;
  versionLabel?: string | null;
  deletedAt?: number | null;
  mergedIntoDishId?: string | null;
};

/**
 * Tab names offered when a cook adds a version. Versions are custom tabs
 * (Ryan 2026-10-04); any name is allowed and is the norm.
 */
export const VERSION_NAME_SUGGESTIONS = [
  "Finish at Kitchen",
  "Finish at Event",
  "Day Of",
];

/** When a dish is finished (Dish.finishTiming), with its plain name. */
export const FINISH_TIMINGS = [
  { value: "finish_at_kitchen", label: "Finish at Kitchen" },
  { value: "finish_at_event", label: "Finish at Event" },
  { value: "day_of", label: "Day Of" },
] as const;

export type FinishTiming = (typeof FINISH_TIMINGS)[number]["value"];

function isLive(row: VersionedDish) {
  return row.deletedAt == null && row.mergedIntoDishId == null;
}

/** The tab name of a dish: its own label, else "Main" for the main dish. */
export function versionTabLabel(dish: VersionedDish): string {
  const label = dish.versionLabel?.trim();
  if (label) return label;
  return dish.versionOfDishId ? dish.name : "Main";
}

/** Live versions of each main dish, by main dish id, in tab-name order. */
export function versionsByMain<T extends VersionedDish>(
  rows: readonly T[],
): Map<string, T[]> {
  const liveIds = new Set(rows.filter(isLive).map((row) => row._id));
  const byMain = new Map<string, T[]>();
  for (const row of rows) {
    const mainId = row.versionOfDishId;
    if (!mainId || !isLive(row) || !liveIds.has(mainId)) continue;
    byMain.set(mainId, [...(byMain.get(mainId) ?? []), row]);
  }
  for (const list of byMain.values())
    list.sort((a, b) => versionTabLabel(a).localeCompare(versionTabLabel(b)));
  return byMain;
}

/** The main dish id of this row: its main when its main is still live. */
export function mainDishIdOf<T extends VersionedDish>(
  rows: readonly T[],
  dish: VersionedDish,
): string {
  const mainId = dish.versionOfDishId;
  if (!mainId) return dish._id;
  return rows.some((row) => row._id === mainId && isLive(row))
    ? mainId
    : dish._id;
}

/** The tabs a dish page shows: the main dish first, then its versions. */
export function versionTabs<T extends VersionedDish>(
  rows: readonly T[],
  dish: VersionedDish,
): T[] {
  const mainId = mainDishIdOf(rows, dish);
  const main = rows.find((row) => row._id === mainId);
  if (!main) return [];
  return [main, ...(versionsByMain(rows).get(mainId) ?? [])];
}

/**
 * The dish list shows main dishes only. Each main row carries how many
 * versions it has, and its versions' names so search still finds it.
 */
export function mainDishRows<T extends VersionedDish>(
  rows: readonly T[],
): Array<T & { versionCount: number; versionNames: string }> {
  const byMain = versionsByMain(rows);
  const shownAsVersion = new Set(
    [...byMain.values()].flat().map((row) => row._id),
  );
  return rows
    .filter((row) => !shownAsVersion.has(row._id))
    .map((row) => {
      const versions = byMain.get(row._id) ?? [];
      return {
        ...row,
        versionCount: versions.length,
        versionNames: versions
          .map((version) => `${version.name} ${version.versionLabel ?? ""}`)
          .join(" "),
      };
    });
}

// Shared recipe (Ryan 2026-10-04): a version cooks from its main dish's
// recipe unless switched to its own. The recipe of a dish is the lines
// (ingredients, recipes, prep steps) whose dishId is dish.recipeDishId, else
// its own id. An event line keeps the recipe it was added with.

/** The dish whose recipe lines this dish cooks from. */
export function recipeDishIdOf(dish: {
  _id: string;
  recipeDishId?: string | null;
}): string {
  return dish.recipeDishId ?? dish._id;
}

/** The dish whose recipe lines this event menu line cooks from. */
export function eventLineRecipeDishId(line: {
  dishId: string;
  recipeDishId?: string | null;
}): string {
  return line.recipeDishId ?? line.dishId;
}

/** A dish and the dish whose recipe it cooks from. */
export type RecipeLink = { dishId: string; recipeDishId?: string | null };

/** Recipe links of dish rows (for menus and dish lists). */
export function dishRecipeLinks(
  dishes: readonly { _id: string; recipeDishId?: string | null }[],
): RecipeLink[] {
  return dishes.map((dish) => ({
    dishId: dish._id,
    recipeDishId: dish.recipeDishId,
  }));
}

/** The dish ids plus the dishes whose recipes they cook from. */
export function withRecipeDishIds(links: readonly RecipeLink[]): string[] {
  return [
    ...new Set(
      links.flatMap((link) =>
        link.recipeDishId ? [link.dishId, link.recipeDishId] : [link.dishId],
      ),
    ),
  ];
}

/**
 * Recipe lines as each dish cooks them: a dish that shares another dish's
 * recipe gets a copy of those lines under its own id (its own lines, if any,
 * are left out). Screens that group lines by dishId then show the shared
 * recipe without other changes.
 */
export function shareRecipeLines<T extends { dishId: string }>(
  lines: readonly T[],
  links: readonly RecipeLink[],
): T[] {
  const sourceOf = new Map<string, string>();
  for (const link of links) {
    if (link.recipeDishId && link.recipeDishId !== link.dishId)
      sourceOf.set(String(link.dishId), String(link.recipeDishId));
  }
  if (sourceOf.size === 0) return lines as T[];
  const shared = lines.filter((line) => !sourceOf.has(String(line.dishId)));
  for (const [dishId, recipeId] of sourceOf) {
    for (const line of lines) {
      if (String(line.dishId) === recipeId)
        shared.push({ ...line, dishId } as T);
    }
  }
  return shared;
}
