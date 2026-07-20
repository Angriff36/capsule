import { NavLink } from "react-router-dom";
import { LOGISTICS_SECTIONS } from "./logisticsRoutes";

export function LogisticsWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Logistics workspace">
      {LOGISTICS_SECTIONS.map((section) => (
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
