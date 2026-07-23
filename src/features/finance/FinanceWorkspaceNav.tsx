import { NavLink } from "react-router-dom";
import { FINANCE_ROUTES, FINANCE_SECTIONS } from "./financeRoutes";

const financeNavigation = [
  ...FINANCE_SECTIONS,
  { key: "tips", label: "Tips", path: FINANCE_ROUTES.tips },
  { key: "taxes", label: "Tax", path: FINANCE_ROUTES.taxes },
  { key: "revenue", label: "Revenue", path: FINANCE_ROUTES.revenue },
  { key: "foodCost", label: "Food cost", path: FINANCE_ROUTES.foodCost },
  {
    key: "profitMargins",
    label: "Profit margins",
    path: FINANCE_ROUTES.profitMargins,
  },
] as const;

export function FinanceWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Finance workspace">
      {financeNavigation.map((section) => (
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
