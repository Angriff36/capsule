import { dietTagsOnly } from "../../../convex/lib/dietaryTags";

/**
 * Venue menu card (Venue Partner Playbook section 06, "Venue-specific menu
 * cards"): the dishes made only for this venue first, then the dishes of one
 * chosen menu, grouped by course in the menu's own order.
 */
export type MenuCardDish = {
  _id: string;
  name: string;
  description?: string | null;
  course?: string | null;
  dietaryTags?: readonly string[] | null;
  primaryImageStorageId?: string | null;
  deletedAt?: unknown;
  status?: string | null;
};

export type MenuCardLine = {
  menuId: string;
  dishId: string;
  sortOrder?: number | null;
  course?: string | null;
  deletedAt?: unknown;
};

export type MenuCardSection = {
  title: string;
  dishes: MenuCardDish[];
};

const liveDish = (dish: MenuCardDish | undefined): dish is MenuCardDish =>
  !!dish && dish.deletedAt == null && dish.status !== "retired";

export function menuCardSections(input: {
  venueName: string;
  exclusiveDishes: readonly MenuCardDish[];
  menuName?: string | null;
  menuId?: string | null;
  menuLines: readonly MenuCardLine[];
  menuDishes: readonly MenuCardDish[];
}): MenuCardSection[] {
  const sections: MenuCardSection[] = [];
  const exclusive = input.exclusiveDishes
    .filter(liveDish)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (exclusive.length > 0) {
    sections.push({ title: `Only at ${input.venueName}`, dishes: exclusive });
  }
  if (!input.menuId) return sections;

  const shown = new Set(exclusive.map((dish) => dish._id));
  const byId = new Map(input.menuDishes.map((dish) => [dish._id, dish]));
  const lines = input.menuLines
    .filter((line) => line.menuId === input.menuId && line.deletedAt == null)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const courses = new Map<string, MenuCardDish[]>();
  for (const line of lines) {
    const dish = byId.get(line.dishId);
    if (!liveDish(dish) || shown.has(dish._id)) continue;
    shown.add(dish._id);
    const course =
      line.course?.trim() || dish.course?.trim() || input.menuName || "Menu";
    courses.set(course, [...(courses.get(course) ?? []), dish]);
  }
  for (const [title, dishes] of courses) sections.push({ title, dishes });
  return sections;
}

/** "Vegan · Gluten free" from dietary tags like "vegan", "gluten_free". */
export function dietaryLine(tags: readonly string[] | null | undefined) {
  return dietTagsOnly(tags)
    .map((tag) => tag.trim().replace(/[_-]+/g, " "))
    .filter(Boolean)
    .map((tag) => tag[0].toUpperCase() + tag.slice(1).toLowerCase())
    .join(" · ");
}
