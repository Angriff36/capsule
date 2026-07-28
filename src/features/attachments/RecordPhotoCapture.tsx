import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import { formatDate, formatTime } from "../../lib/format";
import {
  useAttachmentRemove,
  useAttachmentSetSurveySelection,
  useCreateAttachment,
} from "../../lib/manifest-convex-react";
import { EmptyState, Skeleton } from "../../ui/primitives";

export type PhotoParentType = "delivery" | "closeout" | "eventRecord";

export const EVENT_PHOTO_CATEGORIES = [
  { value: "setup", label: "Setup", hint: "Room, tables, and décor" },
  { value: "food", label: "Food", hint: "Plated dishes and displays" },
  { value: "service", label: "Service", hint: "Staff and guests in action" },
  { value: "venue", label: "Venue", hint: "Space and surroundings" },
] as const;

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
  | (typeof CLOSEOUT_EVIDENCE_CATEGORIES)[number]["value"]
  | (typeof EVENT_PHOTO_CATEGORIES)[number]["value"];

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
  inFeedbackSurvey?: boolean | null;
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
  onToggleSurvey?: (photo: RecordPhoto) => Promise<void>;
  onDownloadAll?: () => Promise<void>;
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
  surveySelection = false,
  downloadAll = false,
}: {
  parentType: PhotoParentType;
  parentId: string;
  title: string;
  description: string;
  evidenceCategories?: readonly PhotoEvidenceCategory[];
  /** Show a per-photo "Use in survey" toggle (post-event feedback survey). */
  surveySelection?: boolean;
  /** Show a "Download all" button for marketing use of the gallery. */
  downloadAll?: boolean;
}) {
  const photos = useQuery(api.fileStorage.listForParent, {
    parentType,
    parentId,
  });
  const generateUploadUrl = useMutation(api.fileStorage.generateUploadUrl);
  const createAttachment = useCreateAttachment();
  const removeAttachment = useAttachmentRemove();
  const setSurveySelection = useAttachmentSetSurveySelection();
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

  async function toggleSurvey(photo: RecordPhoto) {
    setError(null);
    setNotice(null);
    try {
      await setSurveySelection({
        docId: photo._id,
        included: !photo.inFeedbackSurvey,
        version: photo.version,
      });
      setNotice(
        photo.inFeedbackSurvey
          ? "Photo removed from the feedback survey."
          : "Photo will appear in the feedback survey.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The survey selection could not be saved.",
      );
    }
  }

  async function downloadAllPhotos() {
    const withUrls = (photos ?? []).filter((photo) => photo.url);
    if (withUrls.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      for (const photo of withUrls) {
        const response = await fetch(photo.url as string);
        if (!response.ok)
          throw new Error(`Download failed (${response.status})`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = photo.fileName;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      }
      setNotice(
        `Downloaded ${withUrls.length} photo${withUrls.length === 1 ? "" : "s"}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The gallery download failed.",
      );
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
      onToggleSurvey={surveySelection ? toggleSurvey : undefined}
      onDownloadAll={downloadAll ? downloadAllPhotos : undefined}
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
  onToggleSurvey,
  onDownloadAll,
}: RecordPhotoCaptureViewProps) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const testId = `record-photos-${parentType}-${parentId}`;
  const [selectedEvidenceType, setSelectedEvidenceType] = useState<
    PhotoEvidenceType | undefined
  >(evidenceCategories[0]?.value);
  const selectedCategoryLabel =
    evidenceLabel(selectedEvidenceType, evidenceCategories) ?? null;

  async function selectFile(file: File) {
    try {
      await onUpload(file, selectedEvidenceType);
    } finally {
      if (cameraInput.current) cameraInput.current.value = "";
      if (libraryInput.current) libraryInput.current.value = "";
    }
  }

  function chooseCategoryAndPickPhoto(categoryValue: PhotoEvidenceType) {
    setSelectedEvidenceType(categoryValue);
    // Open the picker on the same click so category chips actually do work
    // (sr-only radios previously only mutated state and often scrolled the page).
    window.requestAnimationFrame(() => {
      libraryInput.current?.click();
    });
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
        <div className="mt-4">
          <p
            id={`${testId}-category-label`}
            className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2"
          >
            Add a photo by type
          </p>
          <div
            className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
            role="group"
            aria-labelledby={`${testId}-category-label`}
          >
            {evidenceCategories.map((category) => {
              const selected = selectedEvidenceType === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  disabled={busy}
                  data-testid={`${testId}-category-${category.value}`}
                  aria-pressed={selected}
                  className={`rounded-sm border px-3 py-2.5 text-left transition-colors ${
                    selected
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-line-2 bg-panel text-ink-2 hover:border-line hover:text-ink"
                  }`}
                  onClick={() => chooseCategoryAndPickPhoto(category.value)}
                >
                  <span className="block text-[13px] font-semibold">
                    {category.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                    {category.hint}
                  </span>
                </button>
              );
            })}
          </div>
          {selectedCategoryLabel ? (
            <p className="mt-2 text-[12px] text-ink-2" role="status">
              Next photo will be tagged as{" "}
              <strong className="text-ink">{selectedCategoryLabel}</strong>.
            </p>
          ) : null}
        </div>
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
          {busy
            ? "Uploading…"
            : selectedCategoryLabel
              ? `Take ${selectedCategoryLabel.toLowerCase()} photo`
              : "Take photo"}
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-10 flex-1 sm:flex-none"
          disabled={busy}
          onClick={() => libraryInput.current?.click()}
        >
          Choose photo
        </button>
        {onDownloadAll && (photos?.length ?? 0) > 0 ? (
          <button
            type="button"
            className="btn btn-ghost min-h-10 flex-1 sm:flex-none"
            data-testid={`${testId}-download-all`}
            onClick={() => void onDownloadAll()}
          >
            Download all
          </button>
        ) : null}
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
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Skeleton className="aspect-[4/3]" />
          <Skeleton className="aspect-[4/3]" />
          <Skeleton className="aspect-[4/3]" />
        </div>
      ) : photos.length === 0 ? (
        <EmptyState
          title="No photos attached yet"
          hint="Take or choose a photo above to document this record."
        />
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
                    ? ` · ${formatDate(photo.uploadedAt)} ${formatTime(photo.uploadedAt)}`
                    : ""}
                </p>
                {onToggleSurvey ? (
                  <button
                    type="button"
                    className={`btn btn-sm mt-2 w-full ${
                      photo.inFeedbackSurvey ? "btn-primary" : "btn-ghost"
                    }`}
                    data-testid={`${testId}-survey-toggle-${photo._id}`}
                    onClick={() => void onToggleSurvey(photo)}
                  >
                    {photo.inFeedbackSurvey
                      ? "In feedback survey"
                      : "Use in survey"}
                  </button>
                ) : null}
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
