import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import {
  useAttachmentRemove,
  useCreateAttachment,
} from "../../lib/manifest-convex-react";

export type PhotoParentType = "delivery" | "closeout";

export const CLOSEOUT_EVIDENCE_CATEGORIES = [
  {
    value: "venueCondition",
    label: "Venue condition",
    hint: "Room, loading area, or damage",
  },
  {
    value: "leftoverFood",
    label: "Leftover food",
    hint: "Waste quantity or food disposition",
  },
  {
    value: "equipmentReturn",
    label: "Equipment return",
    hint: "Returned, missing, or damaged gear",
  },
] as const;

export type PhotoEvidenceType =
  (typeof CLOSEOUT_EVIDENCE_CATEGORIES)[number]["value"];

export type PhotoEvidenceCategory = {
  value: PhotoEvidenceType;
  label: string;
  hint: string;
};

export type RecordPhoto = {
  _id: string;
  fileName: string;
  fileSize: number;
  uploadedAt?: number | null;
  evidenceType?: PhotoEvidenceType | null;
  url?: string | null;
  version: number;
};

export type RecordPhotoCaptureViewProps = {
  parentType: PhotoParentType;
  parentId: string;
  title: string;
  description: string;
  evidenceCategories?: readonly PhotoEvidenceCategory[];
  photos: readonly RecordPhoto[] | undefined;
  busy: boolean;
  removingId: string | null;
  error: string | null;
  notice: string | null;
  onUpload: (file: File, evidenceType?: PhotoEvidenceType) => Promise<void>;
  onRemove: (photo: RecordPhoto) => Promise<void>;
};

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function photoFileName(file: File): string {
  if (file.name.trim()) return file.name;
  const extension = file.type.split("/")[1] || "jpg";
  return `field-photo-${new Date().toISOString().replaceAll(":", "-")}.${extension}`;
}

function evidenceLabel(
  evidenceType: PhotoEvidenceType | null | undefined,
  categories: readonly PhotoEvidenceCategory[],
): string | null {
  if (!evidenceType) return null;
  return (
    categories.find((category) => category.value === evidenceType)?.label ??
    null
  );
}

/** Camera-first upload and gallery for field evidence attached to one record. */
export function RecordPhotoCapture({
  parentType,
  parentId,
  title,
  description,
  evidenceCategories,
}: {
  parentType: PhotoParentType;
  parentId: string;
  title: string;
  description: string;
  evidenceCategories?: readonly PhotoEvidenceCategory[];
}) {
  const photos = useQuery(api.fileStorage.listForParent, {
    parentType,
    parentId,
  });
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const removeAttachment = useAttachmentRemove();
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function upload(file: File, evidenceType?: PhotoEvidenceType) {
    if (file.type && !file.type.startsWith("image/")) {
      setError("Choose a photo file to attach.");
      return;
    }

    const contentType = file.type || "image/jpeg";
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!response.ok)
        throw new Error(`Photo upload failed (${response.status})`);
      const { storageId } = (await response.json()) as { storageId: string };
      await createAttachment({
        parentType,
        parentId,
        fileName: photoFileName(file),
        contentType,
        fileSize: file.size,
        storageId,
        ...(evidenceType ? { evidenceType } : {}),
      });
      const label = evidenceLabel(evidenceType, evidenceCategories ?? []);
      setNotice(label ? `${label} photo attached.` : "Photo attached.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The photo could not be attached.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, version: number) {
    setRemovingId(id);
    setError(null);
    setNotice(null);
    try {
      await removeAttachment({ docId: id, version });
      setNotice("Photo removed.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The photo could not be removed.",
      );
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <RecordPhotoCaptureView
      parentType={parentType}
      parentId={parentId}
      title={title}
      description={description}
      evidenceCategories={evidenceCategories}
      photos={photos}
      busy={busy}
      removingId={removingId}
      error={error}
      notice={notice}
      onUpload={upload}
      onRemove={(photo) => remove(photo._id, photo.version)}
    />
  );
}

/** Presentational field-photo surface, separated for browser-level verification. */
export function RecordPhotoCaptureView({
  parentType,
  parentId,
  title,
  description,
  evidenceCategories = [],
  photos,
  busy,
  removingId,
  error,
  notice,
  onUpload,
  onRemove,
}: RecordPhotoCaptureViewProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const testId = `record-photos-${parentType}-${parentId}`;
  const [selectedEvidenceType, setSelectedEvidenceType] = useState<
    PhotoEvidenceType | undefined
  >(evidenceCategories[0]?.value);

  async function selectFile(file: File) {
    try {
      await onUpload(file, selectedEvidenceType);
    } finally {
      if (cameraInput.current) cameraInput.current.value = "";
      if (libraryInput.current) libraryInput.current.value = "";
    }
  }

  return (
    <section
      className="rounded-sm border border-line-2 bg-inset p-3 sm:p-4"
      data-testid={testId}
    >
      <div className="min-w-0">
        <p className="eyebrow">Field photos</p>
        <h3 className="mt-1 text-[15px] font-semibold text-ink">{title}</h3>
        <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-ink-2">
          {description}
        </p>
      </div>

      {evidenceCategories.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">
            What does this photo show?
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {evidenceCategories.map((category) => {
              const selected = selectedEvidenceType === category.value;
              return (
                <label
                  key={category.value}
                  className={`cursor-pointer rounded-sm border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line-2 bg-panel text-ink-2 hover:border-line-3"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${testId}-evidence-type`}
                    value={category.value}
                    checked={selected}
                    className="sr-only"
                    data-testid={`${testId}-category-${category.value}`}
                    onChange={() => setSelectedEvidenceType(category.value)}
                  />
                  <span className="block text-[13px] font-semibold">
                    {category.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                    {category.hint}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid={`${testId}-camera-input`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void selectFile(file);
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          className="hidden"
          data-testid={`${testId}-library-input`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void selectFile(file);
          }}
        />
        <button
          type="button"
          className="btn btn-primary min-h-10 flex-1 sm:flex-none"
          disabled={busy}
          onClick={() => cameraInput.current?.click()}
        >
          {busy ? "Uploading…" : "Take photo"}
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-10 flex-1 sm:flex-none"
          disabled={busy}
          onClick={() => libraryInput.current?.click()}
        >
          Choose photo
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 text-[13px] text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {photos === undefined ? (
        <p className="mt-3 text-[13px] text-ink-3">Loading photos…</p>
      ) : photos.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">No photos attached yet.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((photo) => (
            <li
              key={photo._id}
              className="overflow-hidden rounded-sm border border-line-2 bg-panel"
            >
              {photo.url ? (
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.url}
                    alt={`${title}: ${photo.fileName}`}
                    className="aspect-[4/3] w-full bg-canvas object-cover"
                    loading="lazy"
                  />
                </a>
              ) : (
                <div className="grid aspect-[4/3] place-items-center bg-canvas px-3 text-center text-[12px] text-ink-3">
                  Preview unavailable
                </div>
              )}
              <div className="p-2.5">
                {evidenceLabel(photo.evidenceType, evidenceCategories) ? (
                  <p className="mb-1 inline-flex rounded-full border border-line-2 bg-inset px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-2">
                    {evidenceLabel(photo.evidenceType, evidenceCategories)}
                  </p>
                ) : null}
                <p className="truncate text-[12.5px] font-semibold text-ink">
                  {photo.fileName}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-3">
                  {formatSize(photo.fileSize)}
                  {photo.uploadedAt
                    ? ` · ${new Date(photo.uploadedAt).toLocaleString()}`
                    : ""}
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2 w-full"
                  disabled={removingId != null}
                  onClick={() => void onRemove(photo)}
                >
                  {removingId === photo._id ? "Removing…" : "Remove"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
