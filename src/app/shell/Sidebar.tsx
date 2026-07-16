import { NavLink } from "react-router-dom";
import { navigationCatalog } from "../navigation/NavigationCatalog";

export function Sidebar() {
  const available = navigationCatalog.availableAreas();
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
