import { NavLink } from "react-router-dom";
import { useActiveNavLinkInView } from "../../lib/useActiveNavLinkInView";
import { LOGISTICS_SECTIONS } from "./logisticsRoutes";

export function LogisticsWorkspaceNav() {
  const navRef = useActiveNavLinkInView<HTMLElement>();
  return (
    <nav
      className="kitchen-book-nav"
      ref={navRef}
      aria-label="Logistics workspace"
    >
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
