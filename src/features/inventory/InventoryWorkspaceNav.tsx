import { NavLink } from "react-router-dom";

const sections = [
  { label: "Demand", path: "/inventory/demand" },
  { label: "Stock book", path: "/inventory/stock" },
  { label: "Counts", path: "/inventory/counts" },
  { label: "Audit log", path: "/inventory/audit" },
  { label: "Waste", path: "/inventory/waste" },
  { label: "Lot trace", path: "/inventory/traceability" },
  { label: "Purchasing", path: "/inventory/purchasing" },
  { label: "Contracts", path: "/inventory/contracts" },
] as const;

export function InventoryWorkspaceNav() {
  return (
    <nav
      className="component-status-tabs supply-tabs"
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
