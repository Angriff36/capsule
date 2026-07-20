import { NavLink } from "react-router-dom";
import { CLIENTS_SECTIONS } from "./clientsRoutes";

export function ClientsWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Clients workspace">
      {CLIENTS_SECTIONS.map((section) => (
        <NavLink
          key={section.key}
          to={section.path}
          end={section.key === "accounts"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
