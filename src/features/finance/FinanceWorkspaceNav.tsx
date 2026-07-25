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
  { key: "revenue", label: "Revenue", path: FINANCE_ROUTES.revenue },
  { key: "foodCost", label: "Food cost", path: FINANCE_ROUTES.foodCost },
  {
    key: "profitMargins",
    label: "Profit margins",
    path: FINANCE_ROUTES.profitMargins,
  },
  {
    key: "salesDashboard",
    label: "Sales dashboard",
    path: FINANCE_ROUTES.salesDashboard,
  },
  {
    key: "timsKpis",
    label: "Tim's KPIs",
    path: FINANCE_ROUTES.timsKpis,
  },
  {
    key: "scorecard",
    label: "Scorecard",
    path: FINANCE_ROUTES.scorecard,
  },
  {
    key: "l10",
    label: "L10",
    path: FINANCE_ROUTES.l10,
  },
  {
    key: "avgEventValue",
    label: "Avg event value",
    path: FINANCE_ROUTES.avgEventValue,
  },
  {
    key: "compMaster",
    label: "Comp Master",
    path: FINANCE_ROUTES.compMaster,
  },
  {
    key: "mangia",
    label: "Mangia",
    path: FINANCE_ROUTES.mangia,
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
