import { useEffect, useLayoutEffect, useRef } from "react";
import { StudioCopyApplier } from "./StudioCopyApplier";
import { useStudio } from "./StudioContext";
import "./StudioCatalogRegister";

/**
 * Applies saved wording after each paint, on every signed-in screen, and
 * again whenever the page changes: a button that re-renders its own label
 * (Save, then Saving, then Save) gets the saved words back.
 */
export function StudioCopyApplierHost() {
  const studio = useStudio();
  const applyLatest = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (!studio) {
      applyLatest.current = null;
      return;
    }
    const rows = studio.copy.liveOn(studio.pagePattern);
    const pagePattern = studio.pagePattern;
    applyLatest.current = () => new StudioCopyApplier(rows).apply(pagePattern);
    applyLatest.current();
  });
  useEffect(() => {
    // The applier writes only when the words differ, so its own write
    // settles after one more pass.
    const observer = new MutationObserver(() => applyLatest.current?.());
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);
  return null;
}
