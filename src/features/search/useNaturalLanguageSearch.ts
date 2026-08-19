import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";

export interface SearchHit {
  kind: string;
  id: string;
  label: string;
  hint: string;
  path: string;
  score: number;
}

/**
 * Hits from the last committed (debounced) search must not paint as current
 * while the live query has moved on. Harborview under "Northside" is a
 * stale cache — filter those labels. Once live === debounce the server
 * already ran this query; NL intent is not in the label ("unpaid invoices
 * over 30 days" → "#INV-1 — $900" / hint "Overdue 31d"), so requiring the
 * raw string in label erases a successful search.
 */
export function freshSearchHits(
  liveQuery: string,
  debouncedQuery: string,
  serverHits: readonly SearchHit[],
): SearchHit[] {
  const live = liveQuery.trim();
  if (live.length < 2) return [];
  if (live === debouncedQuery.trim()) return [...serverHits];
  const q = live.toLowerCase();
  return serverHits.filter((hit) => hit.label.toLowerCase().includes(q));
}

export function isSearchPending(opts: {
  enabled: boolean;
  liveQuery: string;
  debouncedQuery: string;
  hitsPending: boolean;
}): boolean {
  const live = opts.liveQuery.trim();
  if (!opts.enabled || live.length < 2) return false;
  return live !== opts.debouncedQuery.trim() || opts.hitsPending;
}

/**
 * Natural-language search across entities. Debounces the Convex call, skips
 * while the term is too short, and passes wall-clock `now` so date/age intent
 * resolves server-side. Stale caches are filtered to the live query;
 * settled NL hits keep the server labels as returned.
 */
export function useNaturalLanguageSearch(
  rawQuery: string,
  enabled = true,
  debounceMs = 180,
) {
  const [debounced, setDebounced] = useState(rawQuery);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(rawQuery), debounceMs);
    return () => window.clearTimeout(t);
  }, [rawQuery, debounceMs]);

  const live = rawQuery.trim();
  const trimmed = debounced.trim();
  const args = useMemo(() => {
    // `enabled` bypasses the debounce so closing the palette drops the
    // subscription on the very next render — a late server error must not
    // crash the page the user navigated to (#133).
    if (!enabled || trimmed.length < 2) return "skip" as const;
    return { query: trimmed, now: Date.now() } as const;
  }, [trimmed, enabled]);

  const hits = useQuery(api.search.searchAll, args);
  const pending = isSearchPending({
    enabled,
    liveQuery: rawQuery,
    debouncedQuery: debounced,
    hitsPending: hits === undefined,
  });
  return {
    hits: freshSearchHits(rawQuery, debounced, (hits ?? []) as SearchHit[]),
    loading: pending,
  };
}
