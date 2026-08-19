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
 * while the live query has moved on. Harborview results staying up under
 * "Northside", or "No matches." on Harborview because debounce hasn't fired,
 * is a false-negative. Prefix matches of the live query may still show.
 */
export function freshSearchHits(
  liveQuery: string,
  serverHits: readonly SearchHit[],
): SearchHit[] {
  const q = liveQuery.trim().toLowerCase();
  if (q.length < 2) return [];
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
 * resolves server-side. Painted hits always match the live query.
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
    hits: freshSearchHits(rawQuery, (hits ?? []) as SearchHit[]),
    loading: pending,
  };
}
