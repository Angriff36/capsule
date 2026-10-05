import type { EventBundle } from "../lib/tppReports/eventBundle";
import {
  dishKey,
  isMenuDishLine,
  normalizeName,
} from "./CapsuleEventBundleShared";
import { finishVersionLabel } from "../lib/dishVersionLabel";

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
  /** Dishes only: the version (tab) name and the main dish it belongs to. */
  versionLabel?: string | null;
  versionOfId?: string | null;
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

/**
 * A dish name can match a main dish and its versions ("Finish at Kitchen",
 * "Drop Off"). Take the version the report says the kitchen finishes it as;
 * otherwise the main dish; otherwise the first match.
 */
function findDish(
  name: string,
  finish: string | undefined,
  candidates: readonly CatalogCandidate[],
): string | undefined {
  const wanted = dishKey(name);
  if (wanted.length === 0) return undefined;
  const matches = candidates.filter(
    (candidate) =>
      dishKey(candidate.name) === wanted ||
      (candidate.aliases ?? []).some((alias) => dishKey(alias) === wanted),
  );
  if (matches.length === 0) return undefined;
  const label = finishVersionLabel(finish, name);
  const family = new Set(matches.map((m) => m.versionOfId ?? m.id));
  const relatives = candidates.filter((c) => family.has(c.versionOfId ?? c.id));
  return (
    (label && relatives.find((c) => c.versionLabel === label)?.id) ??
    matches.find((m) => m.versionOfId == null)?.id ??
    matches[0]!.id
  );
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
    const id = findDish(item.name, item.finish, catalog.dishes);
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
