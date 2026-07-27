import type { KitchenSection } from "../kitchenRoutes";

type CatalogCopySource = {
  description?: string | null;
  category?: string | null;
  cuisine?: string | null;
};

/** Description / fallback text for a catalog card. */
export class CulinaryCatalogCardCopy {
  static description(item: CatalogCopySource): string {
    return item.description?.trim() || "";
  }

  static fallbackHint(
    section: KitchenSection,
    item: CatalogCopySource,
  ): string {
    if (item.category) return item.category;
    if (section === "components" && item.cuisine) return item.cuisine;
    return "No description recorded";
  }

  static glyph(section: KitchenSection, index: number): string {
    if (section === "components") return "R";
    if (section === "ingredients") return "I";
    if (section === "menus") return "M";
    return String(index + 1).padStart(2, "0");
  }
}
