import { NavLink } from "react-router-dom";
import { KITCHEN_SECTIONS } from "./kitchenRoutes";

export function KitchenBookNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Culinary book sections">
      {KITCHEN_SECTIONS.map((section) => (
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
