/**
 * Shared ranking + recents for record pickers (SearchSelect, the ingredient
 * thumbnail picker). Search runs on rows already loaded in the browser.
 */

const RECENTS_LIMIT = 5;
const RECENTS_PREFIX = "capsule:recents:";

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Score one query word against a haystack; 0 = no match. */
function scoreWord(haystack: string, label: string, word: string): number {
  if (label.startsWith(word)) return 100;
  if (new RegExp(`(^|[^a-z0-9])${escapeRegExp(word)}`).test(label)) return 80;
  if (label.includes(word)) return 60;
  if (haystack.includes(word)) return 40;
  // Typo-tolerant fallback: every letter appears in order within one word of
  // the name ("chkn" → chicken). Across the whole name, "chafing" matched a
  // "Cambro Hot water dispenser (filled) - Hand washing".
  const inOrder = (text: string) => {
    let from = 0;
    for (const char of word) {
      const at = text.indexOf(char, from);
      if (at === -1) return false;
      from = at + 1;
    }
    return true;
  };
  return label.split(/[^a-z0-9]+/).some(inOrder) ? 10 : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fuzzy-filter and rank rows. Every query word must match; rows that match
 * at the start of the label sort first. An empty query keeps the input order.
 */
export function rankBySearch<T>(
  rows: readonly T[],
  query: string,
  text: (row: T) => { label: string; extra?: string | null },
): T[] {
  const words = normalizeSearchText(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [...rows];
  const scored: { row: T; score: number; index: number }[] = [];
  rows.forEach((row, index) => {
    const { label, extra } = text(row);
    const normalLabel = normalizeSearchText(label);
    const haystack = `${normalLabel} ${normalizeSearchText(extra ?? "")}`;
    let score = 0;
    for (const word of words) {
      const wordScore = scoreWord(haystack, normalLabel, word);
      if (!wordScore) return;
      score += wordScore;
    }
    scored.push({ row, score, index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((entry) => entry.row);
}

export function readRecents(key: string | undefined): string[] {
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_PREFIX + key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((id): id is string => typeof id === "string")
          .slice(0, RECENTS_LIMIT)
      : [];
  } catch {
    return [];
  }
}

/**
 * Remember a pick; returns the updated most-recent-first list. Sentinel
 * choices such as "__add_new__" are never remembered.
 */
export function rememberRecent(key: string | undefined, id: string): string[] {
  if (!key || !id || id.startsWith("__")) return readRecents(key);
  const next = [id, ...readRecents(key).filter((item) => item !== id)].slice(
    0,
    RECENTS_LIMIT,
  );
  try {
    window.localStorage.setItem(RECENTS_PREFIX + key, JSON.stringify(next));
  } catch {
    // Storage full or blocked: recents are a convenience only.
  }
  return next;
}

/** Pin recent rows (most recent first) ahead of the rest. */
export function pinRecents<T>(
  rows: readonly T[],
  recentIds: readonly string[],
  idOf: (row: T) => string,
): { recent: T[]; rest: T[] } {
  if (!recentIds.length) return { recent: [], rest: [...rows] };
  const byId = new Map(rows.map((row) => [idOf(row), row]));
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((row): row is T => row !== undefined);
  const pinned = new Set(recent.map(idOf));
  return { recent, rest: rows.filter((row) => !pinned.has(idOf(row))) };
}
