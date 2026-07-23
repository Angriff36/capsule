import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

// ponytail: recents are a per-browser localStorage list (like notification read
// state). Move to a per-account entity only if cross-device sync ever matters.
export interface RecentRecord {
  /** Human label for the record kind, e.g. "Event", "Client". */
  type: string;
  label: string;
  path: string;
  at: number;
}

const KEY = "capsule.recents";
const LIMIT = 20;
const CHANGED_EVENT = "capsule:recents";

function load(): RecentRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentRecord =>
        !!r &&
        typeof r.path === "string" &&
        typeof r.label === "string" &&
        typeof r.type === "string" &&
        typeof r.at === "number",
    );
  } catch {
    return [];
  }
}

function save(records: RecentRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {
    // Storage unavailable (private mode) — recents just won't persist.
  }
}

/** Move a record to the front, dedupe by path, cap at the 20 most recent. */
export function pushRecent(entry: Omit<RecentRecord, "at">) {
  const next = [
    { ...entry, at: Date.now() },
    ...load().filter((r) => r.path !== entry.path),
  ].slice(0, LIMIT);
  save(next);
}

export function useRecents(): RecentRecord[] {
  const [records, setRecords] = useState<RecentRecord[]>(load);
  useEffect(() => {
    const sync = () => setRecords(load());
    window.addEventListener(CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return records;
}

/** Record the current route once its label is known. No-op until then. */
export function useTrackRecent(type: string, label: string | null | undefined) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!label) return;
    pushRecent({ type, label, path: pathname });
  }, [type, label, pathname]);
}
