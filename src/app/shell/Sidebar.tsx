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
 * Labeled workspace sidebar. Every area shows its icon AND name under a group
 * heading; "Collapse" folds it to an icon rail (titles still name each area).
 */
export function Sidebar() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSED_KEY) === "1",
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
                className={({ isActive }) => (isActive ? "active" : undefined)}
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
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRightIcon width={14} height={14} />
          ) : (
            <ChevronLeftIcon width={14} height={14} />
          )}
          <span>Collapse</span>
        </button>
      </div>
    </aside>
  );
}
