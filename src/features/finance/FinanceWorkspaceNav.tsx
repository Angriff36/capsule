import { NavLink } from "react-router-dom";
import { FINANCE_ROUTES, FINANCE_SECTIONS } from "./financeRoutes";

const financeNavigation = [
  ...FINANCE_SECTIONS,
  { key: "tips", label: "Tips", path: FINANCE_ROUTES.tips },
  { key: "taxes", label: "Tax", path: FINANCE_ROUTES.taxes },
  {
    key: "venueCommissionTerms",
    label: "Commission terms",
    path: FINANCE_ROUTES.venueCommissionTerms,
  },
  {
    key: "revenueAttribution",
    label: "Attribution",
    path: FINANCE_ROUTES.revenueAttribution,
  },
  { key: "donations", label: "Donations", path: FINANCE_ROUTES.donations },
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
