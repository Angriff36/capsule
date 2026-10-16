import { useLayoutEffect } from "react";
import { StudioCopyApplier } from "./StudioCopyApplier";
import { useStudio } from "./StudioContext";
import "./StudioCatalogRegister";

/** Applies saved wording after each paint, on every signed-in screen. */
export function StudioCopyApplierHost() {
  const studio = useStudio();
  useLayoutEffect(() => {
    if (!studio) return;
    const rows = studio.copy.liveOn(studio.pagePattern);
    new StudioCopyApplier(rows).apply(studio.pagePattern);
  });
  return null;
}
