import { NavLink } from "react-router-dom";
import { useActiveNavLinkInView } from "../../lib/useActiveNavLinkInView";

const sections = [
  { label: "Permissions", path: "/admin" },
  { label: "Announcements", path: "/admin/announcements" },
  { label: "Company", path: "/admin/branding" },
  { label: "Data exports", path: "/admin/data-export" },
  { label: "Integrations", path: "/admin/integrations" },
  { label: "Imports", path: "/admin/imports" },
  { label: "Compare with TPP", path: "/admin/parallel-run" },
  { label: "Match leftover items", path: "/admin/reconcile" },
  { label: "Switch from TPP", path: "/admin/cutover" },
] as const;

export function AdminWorkspaceNav() {
  const navRef = useActiveNavLinkInView<HTMLElement>();
  return (
    <nav
      className="kitchen-book-nav"
      ref={navRef}
      aria-label="Administration workspace"
    >
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
