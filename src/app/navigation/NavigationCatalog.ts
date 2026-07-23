import type { ComponentType, SVGProps } from "react";
import { NAV_AREAS, type NavArea } from "../nav";
import { orgCapabilityNavPolicy } from "./OrgCapabilityNavPolicy";

/** Owns primary nav membership and planned-area filtering for the shell. */
export class NavigationCatalog {
  constructor(private readonly areas: readonly NavArea[] = NAV_AREAS) {}

  availableAreas(
    disabledCapabilities: readonly string[] | undefined = [],
  ): NavArea[] {
    return this.areas.filter(
      (area) =>
        !area.planned &&
        orgCapabilityNavPolicy.isPathEnabled(area.path, disabledCapabilities),
    );
  }

  plannedAreas(): NavArea[] {
    return this.areas.filter((area) => area.planned);
  }

  areaForPath(pathname: string): NavArea | undefined {
    if (pathname === "/") {
      return this.areas.find((area) => area.path === "/");
    }
    return this.areas.find(
      (area) => area.path !== "/" && pathname.startsWith(area.path),
    );
  }
}

export type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const navigationCatalog = new NavigationCatalog();
