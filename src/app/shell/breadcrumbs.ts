import { guideForPath } from "../guide/pageGuides";
import { navigationCatalog } from "../navigation/NavigationCatalog";

export type Breadcrumb = { label: string; to?: string };

const KITCHEN_CATALOG_DETAIL_TERMINAL: Record<string, string> = {
  Dishes: "Dish",
  "Recipes & components": "Component",
  Ingredients: "Ingredient",
  Menus: "Menu",
};

const KITCHEN_CATALOG_PREFIXES = new Set([
  "/kitchen/dishes",
  "/kitchen/components",
  "/kitchen/ingredients",
  "/kitchen/menus",
]);

function isKitchenCatalogDetail(
  pathname: string,
  guidePrefix: string,
): boolean {
  if (!KITCHEN_CATALOG_PREFIXES.has(guidePrefix)) return false;
  if (!pathname.startsWith(`${guidePrefix}/`)) return false;
  // One trailing segment that is a record id — not a named sub-route such
  // as /kitchen/components/import.
  const rest = pathname.slice(guidePrefix.length + 1);
  return rest !== "" && !rest.includes("/") && rest !== "import";
}

/**
 * Topbar breadcrumbs. The area crumb comes from primary nav; the page crumb
 * comes from the guide catalog (longest-prefix match covers every route), so
 * sub-tabs read as themselves — never a generic "Detail" — and an area root
 * never repeats its own name.
 */
export function breadcrumbsForPath(pathname: string): Breadcrumb[] {
  if (pathname === "/") return [{ label: "Home" }];
  if (pathname === "/settings/email") return [{ label: "Email settings" }];
  const area = navigationCatalog.areaForPath(pathname);
  if (!area) return [{ label: "Capsule" }];
  const crumbs: Breadcrumb[] = [{ label: area.label, to: area.path }];
  if (pathname === area.path) return crumbs;
  const guide = guideForPath(pathname);
  if (guide && guide.title !== area.label) {
    if (isKitchenCatalogDetail(pathname, guide.prefix)) {
      crumbs.push({ label: guide.title, to: guide.prefix });
      crumbs.push({
        label:
          KITCHEN_CATALOG_DETAIL_TERMINAL[guide.title] ??
          guide.title.replace(/s$/, ""),
      });
      return crumbs;
    }
    crumbs.push({ label: guide.title, to: guide.prefix });
    return crumbs;
  }
  if (pathname === `${area.path}/new`) crumbs.push({ label: "New" });
  return crumbs;
}
