import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useComponentClearPrimaryImage,
  useComponentSetPrimaryImage,
  useCreateAttachment,
} from "../../lib/manifest-convex-react";
import { DishPrimaryImage } from "./DishPrimaryImage";

type Props = {
  componentId: string;
  componentVersion: number;
  componentName: string;
  storageId?: string | null;
  onError?: (error: unknown) => void;
};

/** Upload / clear a recipe photo via Attachment + Component.setPrimaryImage. */
export function ComponentPrimaryImageUploader({
  componentId,
  componentVersion,
  componentName,
  storageId,
  onError,
}: Props) {
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const setPrimaryImage = useComponentSetPrimaryImage();
  const clearPrimaryImage = useComponentClearPrimaryImage();
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
      <DishPrimaryImage storageId={storageId} alt={componentName} size="hero" />
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
                parentType: "component",
                parentId: componentId,
                fileName: file.name,
                contentType: file.type || "image/jpeg",
                fileSize: file.size,
                storageId: uploadedId,
              });
              await setPrimaryImage({
                docId: componentId,
                version: componentVersion,
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
          {busy ? "Working…" : storageId ? "Replace photo" : "Upload photo"}
        </button>
        {storageId ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await clearPrimaryImage({
                  docId: componentId,
                  version: componentVersion,
                });
              })
            }
          >
            Remove photo
          </button>
        ) : null}
      </div>
    </div>
  );
}
