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
 * Natural-language search across entities. Debounces the query, skips the
 * Convex call while the term is too short, and passes the wall-clock `now` so
 * date/age intent ("events next week", "overdue 30 days") resolves server-side
 * without the query reading Date.now() itself.
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

  const trimmed = debounced.trim();
  const args = useMemo(() => {
    // `enabled` bypasses the debounce so closing the palette drops the
    // subscription on the very next render — a late server error must not
    // crash the page the user navigated to (#133).
    if (!enabled || trimmed.length < 2) return "skip" as const;
    return { query: trimmed, now: Date.now() } as const;
  }, [trimmed, enabled]);

  const hits = useQuery(api.search.searchAll, args);
  return {
    hits: (hits ?? []) as SearchHit[],
    loading: hits === undefined && enabled && trimmed.length >= 2,
  };
}
