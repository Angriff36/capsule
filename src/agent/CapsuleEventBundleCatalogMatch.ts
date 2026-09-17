import type { EventBundle } from "../lib/tppReports/eventBundle";
import {
  dishKey,
  isMenuDishLine,
  normalizeName,
} from "./CapsuleEventBundleShared";

/**
 * Suggests which tenant records a bundle already refers to, by exact
 * normalized name, so a second bundle for a known client, venue or dish
 * reuses the record instead of registering a look-alike. Exact matches only:
 * the review screen opens with these chosen and the person corrects the
 * misses; the agent path applies them as-is because a miss there only means
 * a new record, never a wrong one. Pure.
 */

export interface CatalogCandidate {
  id: string;
  name: string;
  /** Other names the same record answers to (email, company, aliases). */
  aliases?: readonly string[];
}

export interface CatalogCandidates {
  clients: readonly CatalogCandidate[];
  venues: readonly CatalogCandidate[];
  dishes: readonly CatalogCandidate[];
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
  catalog: CatalogCandidates,
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
