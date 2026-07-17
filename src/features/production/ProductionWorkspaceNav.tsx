import { NavLink } from "react-router-dom";
import { PRODUCTION_SECTIONS } from "./productionRoutes";

export function ProductionWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Production workspace">
      {PRODUCTION_SECTIONS.map((section) => (
        <NavLink
          key={section.key}
          to={section.path}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
