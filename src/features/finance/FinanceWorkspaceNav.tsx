import { NavLink } from "react-router-dom";
import { FINANCE_SECTIONS } from "./financeRoutes";

export function FinanceWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Finance workspace">
      {FINANCE_SECTIONS.map((section) => (
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
