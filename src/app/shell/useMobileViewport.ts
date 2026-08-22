import { useEffect, useState } from "react";

/** Phone breakpoint: matches Tailwind `max-md` (below 768px). */
const PHONE_QUERY = "(max-width: 767px)";

/** True while the viewport is phone-sized. Tracks resizes and rotation. */
export function useMobileViewport(): boolean {
  const [mobile, setMobile] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches);
    query.addEventListener("change", onChange);
    setMobile(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return mobile;
}
