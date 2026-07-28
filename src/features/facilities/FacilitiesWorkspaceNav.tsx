import { NavLink } from "react-router-dom";
import { FACILITIES_SECTIONS } from "./facilitiesRoutes";

const sections = [
  { label: "Overview", path: "/facilities" },
  ...FACILITIES_SECTIONS.map(({ label, path }) => ({ label, path })),
] as const;

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
          end={section.path === "/facilities"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
