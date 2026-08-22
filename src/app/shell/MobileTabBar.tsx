import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { api } from "../../lib/api";
import { CalendarIcon, ClockIcon, FlameIcon, XIcon } from "../../ui/icons";
import { navigationCatalog } from "../navigation/NavigationCatalog";
import { ThemeToggle } from "./Sidebar";

/** Primary tabs; each must also be an area the role can reach (see below). */
const PRIMARY = [
  { to: "/events", label: "Events", icon: CalendarIcon },
  { to: "/my", label: "Today", icon: ClockIcon },
  { to: "/kitchen", label: "Kitchen", icon: FlameIcon },
] as const;

const tabClass = (active: boolean) => `mobile-tab${active ? " active" : ""}`;

/**
 * Phone navigation (below 768px): three primary tabs plus "More", which opens
 * a sheet listing every workspace the signed-in role can reach. The desktop
 * sidebar stays hidden at this width (`app-shell-sidebar max-md:hidden`).
 */
export function MobileTabBar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const { pathname } = useLocation();
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const areas = navigationCatalog.availableAreas(
    authStatus?.disabledCapabilities,
  );
  // Same capability kill-switches as the rail and the More sheet.
  const TABS = PRIMARY.filter((tab) =>
    areas.some((area) => area.path === tab.to),
  );
  // Navigating closes the sheet.
  useEffect(() => setMoreOpen(false), [pathname]);

  const primaryPaths = new Set<string>(TABS.map((tab) => tab.to));
  const moreActive =
    !moreOpen &&
    pathname !== "/" &&
    ![...primaryPaths].some((path) => pathname.startsWith(path));

  return (
    <>
      {moreOpen ? (
        <div
          className="mobile-more-sheet md:hidden"
          role="dialog"
          aria-label="All workspaces"
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-1">
            <p className="eyebrow">All workspaces</p>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button
                type="button"
                className="grid h-11 w-11 place-items-center text-ink-2"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
              >
                <XIcon width={16} height={16} />
              </button>
            </div>
          </div>
          <nav
            aria-label="All workspaces"
            className="grid grid-cols-2 gap-1 px-3 pb-3"
          >
            {areas.map((area) => (
              <NavLink
                key={area.path}
                to={area.path}
                end={area.path === "/"}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-base ${
                    isActive
                      ? "bg-inset font-semibold text-ink"
                      : "text-ink-2 hover:bg-inset hover:text-ink"
                  }`
                }
              >
                <area.icon width={17} height={17} />
                <span className="truncate">{area.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}
      <nav className="mobile-tab-bar md:hidden" aria-label="Primary (phone)">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => tabClass(isActive && !moreOpen)}
          >
            <tab.icon width={20} height={20} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={tabClass(moreOpen || moreActive)}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            •••
          </span>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
