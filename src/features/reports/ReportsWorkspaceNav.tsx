import { NavLink } from "react-router-dom";

/** Every report and dashboard in one menu. Finance keeps day-to-day money
 *  work (invoices, payments, closeout); reading the numbers lives here. */
const sections = [
  { label: "Saved reports", path: "/reports" },
  { label: "Revenue", path: "/finance/revenue" },
  { label: "Food cost", path: "/finance/food-cost" },
  { label: "Profit margins", path: "/finance/profit-margins" },
  { label: "Sales", path: "/reports/sales" },
  { label: "Avg event value", path: "/reports/avg-event-value" },
  { label: "Tim's KPIs", path: "/reports/tims-kpis" },
  { label: "L10", path: "/reports/l10" },
  { label: "Scorecard", path: "/reports/scorecard" },
  { label: "Comp Master", path: "/reports/comp-master" },
  { label: "Mangia", path: "/reports/mangia" },
] as const;

export function ReportsWorkspaceNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Reports workspace">
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          end={section.path === "/reports"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
