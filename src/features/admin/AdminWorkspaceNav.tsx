import { NavLink } from "react-router-dom";
import { useActiveNavLinkInView } from "../../lib/useActiveNavLinkInView";

const sections = [
  { label: "Permissions", path: "/admin" },
  { label: "Announcements", path: "/admin/announcements" },
  { label: "Branding", path: "/admin/branding" },
  { label: "Kitchens", path: "/admin/kitchens" },
  { label: "Catalogs", path: "/admin/catalogs" },
  { label: "Assistant", path: "/admin/assistant" },
  { label: "API keys", path: "/admin/api-keys" },
  { label: "Data exports", path: "/admin/data-export" },
  { label: "Integrations", path: "/admin/integrations" },
  { label: "Imports", path: "/admin/imports" },
  { label: "TPP upload", path: "/admin/imports/tpp" },
  { label: "Compare events with TPP", path: "/admin/parallel-run" },
  { label: "Compare payments with TPP", path: "/finance/money-check" },
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
