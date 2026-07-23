import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { navigationCatalog } from "../navigation/NavigationCatalog";
import { MoonIcon, SunIcon } from "../../ui/icons";

function ThemeToggle() {
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
        <SunIcon width={17} height={17} />
      ) : (
        <MoonIcon width={17} height={17} />
      )}
    </button>
  );
}

export function Sidebar() {
  const authStatus = useQuery(api.authStatus.getAuthStatus, {});
  const available = navigationCatalog.availableAreas(
    authStatus?.disabledCapabilities,
  );
  const planned = navigationCatalog.plannedAreas();

  return (
    <aside className="app-shell-sidebar max-md:hidden">
      <NavLink to="/" className="capsule-mark" aria-label="Capsule home">
        <span aria-hidden="true">C</span>
      </NavLink>
      <nav className="icon-nav" aria-label="Primary">
        {available.map((area) => (
          <NavLink
            key={area.path}
            to={area.path}
            end={area.path === "/"}
            aria-label={area.label}
            title={area.label}
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            <area.icon width={19} height={19} />
            <span>{area.label}</span>
          </NavLink>
        ))}
      </nav>
      <ThemeToggle />
      <details className="module-drawer">
        <summary aria-label="Planned areas" title="Planned areas">
          <span aria-hidden="true">•••</span>
        </summary>
        <div className="module-popover">
          <p>Future workspaces</p>
          {planned.map((area) => (
            <NavLink key={area.path} to={area.path}>
              <area.icon width={15} height={15} />
              <span>{area.label}</span>
            </NavLink>
          ))}
        </div>
      </details>
    </aside>
  );
}
