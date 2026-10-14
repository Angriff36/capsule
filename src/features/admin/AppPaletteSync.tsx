import { useEffect } from "react";
import { useListOrganization } from "../../lib/manifest-convex-react";
import { applyAppPalette, parseAppPalette } from "./appPalette";

/** Puts the company's saved app colors on every page. Renders nothing. */
export function AppPaletteSync() {
  const organizations = useListOrganization();
  const record =
    organizations?.find(
      (row) => row.deletedAt == null && String(row.status) === "active",
    ) ?? organizations?.find((row) => row.deletedAt == null);
  const json = (record as { appPaletteJson?: string } | undefined)
    ?.appPaletteJson;

  useEffect(() => {
    if (organizations === undefined) return;
    applyAppPalette(parseAppPalette(json));
  }, [organizations, json]);

  return null;
}
