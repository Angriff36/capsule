import { Fragment, useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { eventsIndexPath } from "../../features/events/eventRoutes";
import { NAV_GROUPS } from "../nav";
import { navigationCatalog } from "../navigation/NavigationCatalog";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoonIcon,
  SunIcon,
} from "../../ui/icons";

const COLLAPSED_KEY = "capsule-sidebar-collapsed";

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark"),
  );
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        localStorage.setItem("capsule-theme", next ? "dark" : "light");
      }}
    >
      {dark ? (
        <SunIcon width={16} height={16} />
      ) : (
        <MoonIcon width={16} height={16} />
      )}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

/**
 * Slim light icon rail inside the workspace sheet (DESIGN.md navigation-rail).
 * It reserves a 94px gutter and floats its own surface, so pointing at it
 * reveals every area's name over the page instead of shoving the page sideways.
 * "Pin" locks the labels open for anyone who wants them permanently, and the
 * choice persists per browser.
 */
export function Sidebar() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) !== "0",
  );
  const available = navigationCatalog.availableAreas(
    authStatus?.disabledCapabilities,
  );
  const groups = NAV_GROUPS.map((group) => ({
    group,
    areas: available.filter((area) => area.group === group),
  })).filter(({ areas }) => areas.length > 0);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
  };

  return (
    <aside
      className="app-shell-sidebar max-md:hidden"
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="rail-inner">
        <NavLink to="/" className="sidebar-brand" aria-label="Capsule home">
          <span className="capsule-mark" aria-hidden="true">
            C
          </span>
          <strong>Capsule</strong>
        </NavLink>
        <nav className="sidebar-nav" aria-label="Primary">
          {groups.map(({ group, areas }) => (
            <Fragment key={group}>
              <p className="sidebar-group">{group}</p>
              {areas.map((area) => (
                <NavLink
                  key={area.path}
                  to={area.path === "/events" ? eventsIndexPath() : area.path}
                  end={area.path === "/"}
                  aria-label={area.label}
                  title={area.label}
                  className={({ isActive }) =>
                    isActive ? "active" : undefined
                  }
                >
                  <area.icon width={17} height={17} />
                  <span>{area.label}</span>
                </NavLink>
              ))}
            </Fragment>
          ))}
        </nav>
        <div className="sidebar-foot">
          <ThemeToggle />
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Pin the labels open" : "Unpin the labels"}
            title={collapsed ? "Pin the labels open" : "Unpin the labels"}
            aria-pressed={!collapsed}
          >
            {collapsed ? (
              <ChevronRightIcon width={14} height={14} />
            ) : (
              <ChevronLeftIcon width={14} height={14} />
            )}
            <span>{collapsed ? "Pin labels" : "Unpin"}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
