import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useCreateAttachment,
  useDishClearPrimaryImage,
  useDishSetPrimaryImage,
} from "../../lib/manifest-convex-react";
import { DishPrimaryImage } from "./DishPrimaryImage";

type Props = {
  dishId: string;
  dishVersion: number;
  dishName: string;
  storageId?: string | null;
  onError?: (error: unknown) => void;
};

/** Upload / clear Dish primary image via Attachment + Dish.setPrimaryImage. */
export function DishPrimaryImageUploader({
  dishId,
  dishVersion,
  dishName,
  storageId,
  onError,
}: Props) {
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const setPrimaryImage = useDishSetPrimaryImage();
  const clearPrimaryImage = useDishClearPrimaryImage();
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
      <DishPrimaryImage storageId={storageId} alt={dishName} size="hero" />
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
              const uploadUrl = await generateUploadUrl();
              const response = await fetch(uploadUrl, {
                method: "POST",
                headers: {
                  "Content-Type": file.type || "application/octet-stream",
                },
                body: file,
              });
              if (!response.ok) {
                throw new Error(`Upload failed (${response.status})`);
              }
              const { storageId: uploadedId } = (await response.json()) as {
                storageId: string;
              };
              await createAttachment({
                parentType: "dish",
                parentId: dishId,
                fileName: file.name,
                contentType: file.type || "image/jpeg",
                fileSize: file.size,
                storageId: uploadedId,
              });
              await setPrimaryImage({
                docId: dishId,
                version: dishVersion,
                storageId: uploadedId,
                fileName: file.name,
              });
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
                  docId: dishId,
                  version: dishVersion,
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
