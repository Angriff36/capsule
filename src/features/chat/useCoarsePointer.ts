import { useEffect, useState } from "react";

const COARSE_QUERY = "(pointer: coarse)";

/**
 * True on touch-first devices. There Enter inserts a newline (only the Send
 * button sends) and hover-only reveals stay visible.
 */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(COARSE_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(COARSE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setCoarse(event.matches);
    query.addEventListener("change", onChange);
    setCoarse(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return coarse;
}
