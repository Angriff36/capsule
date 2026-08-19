import { guideForPath } from "../guide/pageGuides";
import { navigationCatalog } from "../navigation/NavigationCatalog";

export type Breadcrumb = { label: string; to?: string };

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
  if (guide && guide.prefix !== area.path) {
    crumbs.push({ label: guide.title, to: guide.prefix });
    if (pathname !== guide.prefix) crumbs.push({ label: "Detail" });
    return crumbs;
  }
  if (pathname === `${area.path}/new`) crumbs.push({ label: "New" });
  else crumbs.push({ label: "Detail" });
  return crumbs;
}
