import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useAttachmentRemove,
  useCreateAttachment,
} from "../../lib/manifest-convex-react";
import { morePictures, pictureKind } from "./pictureList";

type Props = {
  parentType: "component" | "equipment";
  parentId: string;
  name: string;
  mainStorageId?: string | null;
  /** Make one kept picture the main one (Component / Equipment setPrimaryImage). */
  onMakeMain: (storageId: string, fileName: string) => Promise<unknown>;
  onError: (error: unknown) => void;
};

/**
 * Every picture and video kept on a recipe or catalog item besides the main
 * picture: plating shots, method steps, a short how-to clip. Staff add several
 * at once, make one the main picture, or remove one.
 */
export function RecordPictures({
  parentType,
  parentId,
  name,
  mainStorageId,
  onMakeMain,
  onError,
}: Props) {
  const rows = useQuery(api.fileStorage.listForParent, {
    parentType,
    parentId,
  });
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const removeAttachment = useAttachmentRemove();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const items = morePictures(rows, mainStorageId);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    onError(null);
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const upload = (files: File[]) =>
    run(async () => {
      let needsMain = !mainStorageId;
      for (const file of files) {
        const contentType = file.type || "application/octet-stream";
        if (!pictureKind(contentType)) {
          throw new Error(`${file.name} is not a picture or a video.`);
        }
        const response = await fetch(await generateUploadUrl(), {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`${file.name} did not upload (${response.status}).`);
        }
        const { storageId } = (await response.json()) as { storageId: string };
        await createAttachment({
          parentType,
          parentId,
          fileName: file.name,
          contentType,
          fileSize: file.size,
          storageId,
        });
        // The first picture on an item with no main picture becomes it.
        if (needsMain && pictureKind(contentType) === "picture") {
          needsMain = false;
          await onMakeMain(storageId, file.name);
        }
      }
    });

  return (
    <div className="space-y-2" data-testid="record-pictures">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          More pictures and video
          {items.length > 0 ? ` (${items.length})` : ""}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length > 0) void upload(files);
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Working…" : "Add pictures or video"}
        </button>
      </div>
      {rows === undefined ? null : items.length === 0 ? (
        <p className="text-sm text-ink-3">
          None yet. Add plating shots, method steps or a short clip.
        </p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3">
          {items.map((item) => (
            <li key={item._id} className="space-y-1">
              {!item.url ? (
                <div className="flex h-28 w-full items-center justify-center border border-line bg-inset text-xs text-ink-3">
                  Unavailable
                </div>
              ) : item.kind === "video" ? (
                <video
                  src={item.url}
                  controls
                  preload="metadata"
                  className="h-28 w-full rounded-xs bg-inset object-cover"
                  aria-label={`${name}: ${item.fileName}`}
                />
              ) : (
                <a href={item.url} target="_blank" rel="noreferrer">
                  <img
                    src={item.url}
                    alt={`${name}: ${item.fileName}`}
                    className="h-28 w-full rounded-xs object-cover"
                  />
                </a>
              )}
              <p className="truncate text-xs text-ink-2" title={item.fileName}>
                {item.fileName}
              </p>
              <div className="flex flex-wrap gap-1">
                {item.kind === "picture" ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() =>
                      void run(() => onMakeMain(item.storageId, item.fileName))
                    }
                  >
                    Make main
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      removeAttachment({
                        docId: item._id,
                        version: item.version,
                      }),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
