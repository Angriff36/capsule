import {
  dishKey,
  isMenuDishLine,
  normalizeName,
} from "../../../agent/CapsuleEventBundleShared";
import type { EventBundle } from "../../../lib/tppReports/eventBundle";

/**
 * Suggests which tenant records a bundle already refers to, by name, so the
 * review screen opens with the right client, venue and catalog dishes chosen
 * and the person only corrects the misses. Pure.
 */

export interface CatalogCandidate {
  id: string;
  name: string;
  /** Other names the same record answers to (email, company, aliases). */
  aliases?: readonly string[];
}

export interface CatalogMatchSuggestion {
  clientId?: string;
  venueId?: string;
  /** dishKey(menu item name) → catalog dish id. */
  dishIds: Record<string, string>;
  /** Menu lines with no catalog match; they will be introduced as new dishes. */
  newDishNames: string[];
}

function findByName(
  name: string | undefined,
  candidates: readonly CatalogCandidate[],
  keyOf: (value: string) => string,
): string | undefined {
  if (!name) return undefined;
  const wanted = keyOf(name);
  if (wanted.length === 0) return undefined;
  const exact = candidates.find(
    (candidate) =>
      keyOf(candidate.name) === wanted ||
      (candidate.aliases ?? []).some((alias) => keyOf(alias) === wanted),
  );
  return exact?.id;
}

export function suggestCatalogMatches(
  bundle: EventBundle,
  catalog: {
    clients: readonly CatalogCandidate[];
    venues: readonly CatalogCandidate[];
    dishes: readonly CatalogCandidate[];
  },
): CatalogMatchSuggestion {
  const dishIds: Record<string, string> = {};
  const newDishNames: string[] = [];
  for (const item of bundle.menu) {
    if (!isMenuDishLine(item)) continue;
    const key = dishKey(item.name);
    if (key in dishIds) continue;
    const id = findByName(item.name, catalog.dishes, dishKey);
    if (id !== undefined) dishIds[key] = id;
    else newDishNames.push(item.name);
  }
  return {
    clientId: findByName(bundle.client.name, catalog.clients, normalizeName),
    venueId: findByName(bundle.venue.name, catalog.venues, normalizeName),
    dishIds,
    newDishNames,
  };
}

/** Menu lines the plan will turn into dishes, deduplicated by dish key. */
export function bundleDishLines(
  bundle: EventBundle,
): Array<{ key: string; name: string; quantityServings?: number }> {
  const seen = new Set<string>();
  const lines: Array<{ key: string; name: string; quantityServings?: number }> =
    [];
  for (const item of bundle.menu) {
    if (!isMenuDishLine(item)) continue;
    const key = dishKey(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push({
      key,
      name: item.name,
      quantityServings: item.quantityServings,
    });
  }
  return lines;
}
