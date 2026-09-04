import type { KitchenSection } from "../kitchenRoutes";

/** Visual tone per catalog kind — keeps cards from reading as one flat type. */
export class CulinaryCatalogCardTone {
  static kindLabel(section: KitchenSection): string {
    switch (section) {
      case "components":
        return "Component";
      case "ingredients":
        return "Ingredient";
      case "dishes":
        return "Dish";
      case "menus":
        return "Menu";
      default:
        return "Record";
    }
  }

  static cardClass(section: KitchenSection): string {
    return `culinary-card culinary-card--${section}`;
  }

  static statusClass(status: string): string {
    const normalized = status.toLowerCase();
    if (normalized === "active" || normalized === "published") {
      return "is-live";
    }
    if (normalized === "draft" || normalized === "pending") {
      return "is-draft";
    }
    if (
      normalized === "archived" ||
      normalized === "retired" ||
      normalized === "inactive" ||
      normalized === "merged"
    ) {
      return "is-quiet";
    }
    return "is-warn";
  }
}
