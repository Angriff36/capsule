import { NavLink } from "react-router-dom";

const sections = [
  { label: "Demand", path: "/inventory/demand" },
  { label: "Stock book", path: "/inventory/stock" },
  { label: "Purchasing", path: "/inventory/purchasing" },
] as const;

export function InventoryWorkspaceNav() {
  return (
    <nav
      className="recipe-status-tabs supply-tabs"
      aria-label="Inventory workspace"
    >
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
