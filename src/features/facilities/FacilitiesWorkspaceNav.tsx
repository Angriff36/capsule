import { NavLink } from "react-router-dom";
import { FACILITIES_SECTIONS } from "./facilitiesRoutes";

const sections = FACILITIES_SECTIONS.map(({ label, path }) => ({
  label,
  path,
}));

export function FacilitiesWorkspaceNav() {
  return (
    <nav
      className="component-status-tabs supply-tabs"
      aria-label="Facilities workspace"
    >
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          // Venues stays quiet on the layout-template list under it.
          end={section.path === "/facilities/venues"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
