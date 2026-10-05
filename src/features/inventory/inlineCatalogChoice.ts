/** Select value that turns a catalog picker into a "type a new name" box. */
export const ADD_NEW_CHOICE = "__add_new__";

/**
 * A name typed in an inline "new location / new vendor" box may already
 * exist: a retry after a failed save created it the first time, or someone
 * added it meanwhile. Reuse that record instead of making a twin.
 */
export function findByName<T extends { readonly name?: unknown }>(
  items: readonly T[],
  name: string,
): T | undefined {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return undefined;
  return items.find(
    (item) =>
      String(item.name ?? "")
        .trim()
        .toLowerCase() === wanted,
  );
}
