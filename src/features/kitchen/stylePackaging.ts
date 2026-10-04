export type ServiceStyleOption = {
  _id: string;
  name: string;
  code?: string | null;
  sortOrder?: number | null;
  status?: string | null;
  deletedAt?: number | null;
};

export type StylePackagingRow = {
  _id: string;
  version: number;
  componentId?: string | null;
  dishId?: string | null;
  serviceStyleId: string;
  instructions: string;
  container?: string | null;
  deletedAt?: number | null;
};

/** A recipe (componentId) or a dish or dish version (dishId). */
export type PackagingOwner = { componentId: string } | { dishId: string };

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The company's service styles in their set order, retired ones left out. */
export function activeServiceStyles(
  styles: readonly ServiceStyleOption[] | undefined,
) {
  return (styles ?? [])
    .filter((style) => style.deletedAt == null && style.status !== "inactive")
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );
}

function ownedBy(row: StylePackagingRow, owner: PackagingOwner) {
  return "componentId" in owner
    ? row.componentId === owner.componentId
    : row.dishId === owner.dishId;
}

/** The live packaging lines of one recipe or dish. */
export function packagingFor(
  rows: readonly StylePackagingRow[] | undefined,
  owner: PackagingOwner,
) {
  return (rows ?? []).filter(
    (row) => row.deletedAt == null && ownedBy(row, owner),
  );
}

/** One line per service style the company has, with its packaging or null. */
export function packagingByStyle(
  styles: readonly ServiceStyleOption[] | undefined,
  rows: readonly StylePackagingRow[] | undefined,
  owner: PackagingOwner,
) {
  const mine = packagingFor(rows, owner);
  return activeServiceStyles(styles).map((style) => ({
    style,
    row: mine.find((row) => row.serviceStyleId === style._id) ?? null,
  }));
}

/**
 * The packaging line an event shows for one dish: the dish's own line for the
 * event's service style first, then the line of each recipe in it. An event
 * with no service style shows nothing (there is no line to pick).
 */
export function packagingForEvent(
  rows: readonly StylePackagingRow[] | undefined,
  serviceStyleId: string | null | undefined,
  dishId: string,
  componentIds: readonly string[] = [],
) {
  if (!serviceStyleId) return [];
  const live = (rows ?? []).filter(
    (row) => row.deletedAt == null && row.serviceStyleId === serviceStyleId,
  );
  const dish = live.find((row) => row.dishId === dishId);
  const recipes = componentIds
    .map((id) => live.find((row) => row.componentId === id))
    .filter((row): row is StylePackagingRow => row != null);
  return dish ? [dish, ...recipes] : recipes;
}

/**
 * The company service style a recipe-sheet packaging key names (drop_off,
 * bring_hot, cook_on_site): same code, or a style whose name holds the words
 * ("Bring Hot / Buffet – Bring Hot" for bring_hot).
 */
export function serviceStyleForSheetKey(
  key: string,
  styles: readonly ServiceStyleOption[] | undefined,
) {
  const wanted = squash(key);
  if (!wanted) return null;
  const active = activeServiceStyles(styles);
  return (
    active.find((style) => squash(style.code ?? "") === wanted) ??
    active.find((style) => squash(style.name) === wanted) ??
    active.find((style) => squash(style.name).includes(wanted)) ??
    null
  );
}

/** "1 hour 20 minutes", "45 minutes", "2 hours". */
export function formatMinutes(minutes: number) {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (rest > 0 || hours === 0) {
    parts.push(`${rest} ${rest === 1 ? "minute" : "minutes"}`);
  }
  return parts.join(" ");
}
