import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { CulinaryEntityLink } from "./CulinaryEntityLink";

export type IngredientCatalogRow = {
  _id: string;
  name: string;
  primaryImageStorageId?: string | null;
  status?: string;
  deletedAt?: number | null;
};

type Props = {
  ingredientId: string;
  ingredients: readonly IngredientCatalogRow[] | undefined;
  link?: boolean;
};

/** Ingredient name with optional catalog thumbnail — for tables and lists. */
export function IngredientCatalogLabel({
  ingredientId,
  ingredients,
  link = false,
}: Props) {
  const row = ingredients?.find((item) => item._id === ingredientId);
  if (!row) {
    return <span>Unknown ingredient</span>;
  }
  const body = (
    <span className="inline-flex min-w-0 items-center gap-2">
      <DishPrimaryImage
        storageId={row.primaryImageStorageId}
        alt={row.name}
        size="thumb"
      />
      <strong className="truncate">{row.name}</strong>
    </span>
  );
  if (link) {
    return (
      <CulinaryEntityLink kind="ingredient" id={row._id}>
        {body}
      </CulinaryEntityLink>
    );
  }
  return body;
}
