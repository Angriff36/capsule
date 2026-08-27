import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useCreateAttachment,
  useIngredientClearPrimaryImage,
  useIngredientSetPrimaryImage,
} from "../../lib/manifest-convex-react";
import { uploadCatalogPrimaryImage } from "./catalogPrimaryImageUpload";
import { DishPrimaryImage } from "./DishPrimaryImage";

type Props = {
  ingredientId: string;
  ingredientVersion: number;
  ingredientName: string;
  storageId?: string | null;
  onError?: (error: unknown) => void;
};

/** Upload / clear Ingredient primary image via Attachment + Ingredient.setPrimaryImage. */
export function IngredientPrimaryImageUploader({
  ingredientId,
  ingredientVersion,
  ingredientName,
  storageId,
  onError,
}: Props) {
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const setPrimaryImage = useIngredientSetPrimaryImage();
  const clearPrimaryImage = useIngredientClearPrimaryImage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      onError?.(error);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <DishPrimaryImage
        storageId={storageId}
        alt={ingredientName}
        size="hero"
      />
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void run(async () => {
              await uploadCatalogPrimaryImage(
                file,
                "ingredient",
                ingredientId,
                ingredientVersion,
                {
                  generateUploadUrl,
                  createAttachment,
                  setPrimaryImage,
                },
              );
            });
          }}
        />
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Working…" : storageId ? "Replace image" : "Upload image"}
        </button>
        {storageId ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await clearPrimaryImage({
                  docId: ingredientId,
                  version: ingredientVersion,
                });
              })
            }
          >
            Remove image
          </button>
        ) : null}
      </div>
    </div>
  );
}
