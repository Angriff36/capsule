import { NavLink } from "react-router-dom";

const sections = [
  { label: "Permissions", path: "/admin" },
  { label: "Announcements", path: "/admin/announcements" },
  { label: "Branding", path: "/admin/branding" },
  { label: "Data exports", path: "/admin/data-export" },
  { label: "Integrations", path: "/admin/integrations" },
  { label: "Import runs", path: "/admin/imports" },
  { label: "Parallel run", path: "/admin/parallel-run" },
  { label: "Reconcile records", path: "/admin/reconcile" },
] as const;

export function AdminWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Administration workspace">
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          end={section.path === "/admin"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
