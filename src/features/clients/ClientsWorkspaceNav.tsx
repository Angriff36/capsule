import { NavLink } from "react-router-dom";
import { CLIENTS_PIPELINE_SECTION, CLIENTS_SECTIONS } from "./clientsRoutes";

export function ClientsWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Clients workspace">
      {[CLIENTS_PIPELINE_SECTION, ...CLIENTS_SECTIONS].map((section) => (
        <NavLink
          key={section.key}
          to={section.path}
          // "accounts" (/clients) and "proposals" (/clients/proposals) are
          // prefixes of sibling tabs — without `end` two underlines light up
          // at once (e.g. on /clients/proposals/templates).
          end={section.key === "accounts" || section.key === "proposals"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
