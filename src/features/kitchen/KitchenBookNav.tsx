import { NavLink } from "react-router-dom";
import "./culinary-studio/CulinaryStudio.css";
import "./culinary-studio/CulinaryStudioSurfaces.css";
import { KITCHEN_SECTIONS } from "./kitchenRoutes";

export function KitchenBookNav() {
  return (
    <nav className="kitchen-book-nav" aria-label="Culinary book sections">
      {KITCHEN_SECTIONS.map((section) => (
        <NavLink
          key={section.key}
          to={section.path}
          end={section.key !== "prep"}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}
