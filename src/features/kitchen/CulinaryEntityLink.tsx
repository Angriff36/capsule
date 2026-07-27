import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  dishPath,
  ingredientPath,
  menuPath,
  componentPath,
} from "./kitchenRoutes";

type EntityKind = "component" | "ingredient" | "dish" | "menu";

export function CulinaryEntityLink({
  kind,
  id,
  children,
  className,
}: {
  kind: EntityKind;
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const path =
    kind === "component"
      ? componentPath(id)
      : kind === "ingredient"
        ? ingredientPath(id)
        : kind === "dish"
          ? dishPath(id)
          : menuPath(id);
  return (
    <Link to={path} className={className ?? "culinary-entity-link"}>
      {children}
    </Link>
  );
}
