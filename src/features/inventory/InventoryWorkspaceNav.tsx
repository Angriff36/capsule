import { NavLink, useLocation } from "react-router-dom";

const sections = [
  { label: "Stock", path: "/inventory/stock" },
  { label: "Counts", path: "/inventory/counts" },
  { label: "Waste", path: "/inventory/waste" },
  { label: "Lot trace", path: "/inventory/traceability" },
  { label: "Purchasing", path: "/inventory/purchasing" },
  { label: "Contracts", path: "/inventory/contracts" },
] as const;

export function InventoryWorkspaceNav() {
  // Vendor order pages live under /inventory/orders but belong to Purchasing.
  const onOrders = useLocation().pathname.startsWith("/inventory/orders");
  return (
    <nav
      className="component-status-tabs supply-tabs"
      aria-label="Inventory workspace"
    >
      {sections.map((section) => (
        <NavLink
          key={section.path}
          to={section.path}
          className={({ isActive }) =>
            isActive || (onOrders && section.path === "/inventory/purchasing")
              ? "active"
              : undefined
          }
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
