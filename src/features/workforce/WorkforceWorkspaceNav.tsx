import { NavLink } from "react-router-dom";
import { WORKFORCE_SECTIONS } from "./workforceRoutes";

export function WorkforceWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Staff workspace">
      {WORKFORCE_SECTIONS.map((section) => (
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
