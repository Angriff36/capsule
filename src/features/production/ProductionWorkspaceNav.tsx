import { NavLink } from "react-router-dom";
import { useActiveNavLinkInView } from "../../lib/useActiveNavLinkInView";
import { PRODUCTION_SECTIONS } from "./productionRoutes";

export function ProductionWorkspaceNav() {
  const navRef = useActiveNavLinkInView<HTMLElement>();
  return (
    <nav
      className="kitchen-book-nav"
      ref={navRef}
      aria-label="Production workspace"
    >
      {PRODUCTION_SECTIONS.map((section) => (
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
