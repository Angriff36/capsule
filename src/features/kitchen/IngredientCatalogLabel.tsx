import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { useIngredientCatalogImageUrl } from "../../lib/IngredientCatalogImageContext";
import { CulinaryEntityLink } from "./CulinaryEntityLink";

export type IngredientCatalogRow = {
  _id: string;
  name: string;
  primaryImageStorageId?: string | null;
  status?: string;
  deletedAt?: number | null;
};

const THUMB_CLASS =
  "h-14 w-14 rounded-xs object-cover flex items-center justify-center border border-dashed border-line bg-inset text-xs text-ink-3";

type Props = {
  ingredientId: string;
  ingredients: readonly IngredientCatalogRow[] | undefined;
  link?: boolean;
};

function CatalogThumb({
  name,
  storageId,
  imageUrl,
}: {
  name: string;
  storageId?: string | null;
  imageUrl?: string | null;
}) {
  if (!storageId) {
    return (
      <div className={THUMB_CLASS} role="img" aria-label={`${name} — no image`}>
        No image
      </div>
    );
  }
  if (imageUrl === undefined) {
    return (
      <div className={`animate-pulse bg-line/40 ${THUMB_CLASS}`} aria-hidden />
    );
  }
  if (!imageUrl) {
    return (
      <div
        className={THUMB_CLASS}
        role="img"
        aria-label={`${name} — image unavailable`}
      >
        Unavailable
      </div>
    );
  }
  return (
    <img
      src={imageUrl}
      alt={name}
      className={`${THUMB_CLASS} border-0 object-cover`}
    />
  );
}

/** Ingredient name with optional catalog thumbnail — for tables and lists. */
export function IngredientCatalogLabel({
  ingredientId,
  ingredients,
  link = false,
}: Props) {
  const row = ingredients?.find((item) => item._id === ingredientId);
  const batchedUrl = useIngredientCatalogImageUrl(row?.primaryImageStorageId);
  if (!row) {
    return <span>Unknown ingredient</span>;
  }
  const body = (
    <span className="inline-flex min-w-0 items-center gap-2">
      {batchedUrl !== undefined ? (
        <CatalogThumb
          name={row.name}
          storageId={row.primaryImageStorageId}
          imageUrl={batchedUrl}
        />
      ) : (
        <DishPrimaryImage
          storageId={row.primaryImageStorageId}
          alt={row.name}
          size="thumb"
        />
      )}
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
