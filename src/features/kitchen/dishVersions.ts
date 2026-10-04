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

/** Names offered when a cook adds a version; any other name is allowed. */
export const VERSION_NAME_SUGGESTIONS = [
  "Finish at Kitchen",
  "Finish at Event",
  "Passed",
  "Drop Off",
  "Vending",
  "Action Station",
  "Day Of",
];

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
