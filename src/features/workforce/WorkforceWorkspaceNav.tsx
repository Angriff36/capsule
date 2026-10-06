import { NavLink } from "react-router-dom";
import { useActiveNavLinkInView } from "../../lib/useActiveNavLinkInView";
import { WORKFORCE_SECTIONS } from "./workforceRoutes";

export function WorkforceWorkspaceNav() {
  const navRef = useActiveNavLinkInView<HTMLElement>();
  return (
    <nav className="kitchen-book-nav" ref={navRef} aria-label="Staff workspace">
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
