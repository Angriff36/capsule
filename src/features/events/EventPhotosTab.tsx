import {
  EVENT_PHOTO_CATEGORIES,
  RecordPhotoCapture,
} from "../attachments/RecordPhotoCapture";
import { AttachmentsSection } from "../attachments/AttachmentsSection";
import { useParentPhotos } from "../attachments/useParentPhotos";
import { EventTabIntro } from "./EventTabIntro";
import {
  EventPhotoActivity,
  EventPhotoAlbumGrid,
  type EventPhotoAlbum,
  type EventPhotoRow,
} from "./EventPhotosAlbums";

type Props = {
  readonly eventId: string;
};

const RECENT_UPLOADS = 5;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function categoryLabel(evidenceType?: string | null): string {
  return (
    EVENT_PHOTO_CATEGORIES.find((category) => category.value === evidenceType)
      ?.label ?? "Untagged"
  );
}

export function EventPhotosTab({ eventId }: Props) {
  const photos = useParentPhotos("eventRecord", eventId);

  const rows: readonly EventPhotoRow[] = photos ?? [];
  const byNewest = [...rows].sort(
    (left, right) =>
      Number(right.uploadedAt ?? 0) - Number(left.uploadedAt ?? 0),
  );
  const albums: EventPhotoAlbum[] = EVENT_PHOTO_CATEGORIES.map((category) => {
    const inCategory = byNewest.filter(
      (photo) => photo.evidenceType === category.value,
    );
    const cover = inCategory.find((photo) => photo.url)?.url ?? null;
    return {
      value: category.value,
      label: category.label,
      hint: category.hint,
      count: inCategory.length,
      cover,
      latestAt: inCategory[0]?.uploadedAt ?? null,
    };
  });
  const filledAlbums = albums.filter((album) => album.count > 0).length;
  const gallerySize = rows.reduce((sum, photo) => sum + photo.fileSize, 0);
  const surveyCount = rows.filter((photo) => photo.inFeedbackSurvey).length;

  return (
    <section className="space-y-5" data-testid="event-photos-tab">
      <EventTabIntro
        title="Event photo gallery"
        description="Upload setup, food, service, and venue photos. Empty gallery starts with the upload action below."
      />

      <section className="card p-5" aria-label="Gallery summary">
        <h3 className="text-lg font-semibold text-ink">Event photo gallery</h3>
        <p className="mt-1 text-sm text-ink-3">
          {photos === undefined
            ? "Loading photos…"
            : `${rows.length} ${rows.length === 1 ? "photo" : "photos"} across ${filledAlbums} of ${albums.length} categories`}
        </p>
      </section>

      <EventPhotoAlbumGrid albums={albums} loading={photos === undefined} />

      <RecordPhotoCapture
        parentType="eventRecord"
        parentId={eventId}
        title="Gallery"
        description="Capture photos during and after the event. Mark selections for the post-event feedback survey when needed."
        evidenceCategories={EVENT_PHOTO_CATEGORIES}
        surveySelection
        downloadAll
      />

      <EventPhotoActivity
        photos={byNewest.slice(0, RECENT_UPLOADS)}
        labelFor={categoryLabel}
      />

      {rows.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <section className="card p-5" aria-label="Gallery size">
            <h3 className="mb-4 text-base font-semibold text-ink">
              Gallery size
            </h3>
            <div className="text-2xl font-semibold text-ink">
              {formatSize(gallerySize)}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              across {rows.length} {rows.length === 1 ? "file" : "files"}
            </p>
          </section>
          <section className="card p-5" aria-label="Feedback survey selection">
            <h3 className="mb-4 text-base font-semibold text-ink">
              In the feedback survey
            </h3>
            <div className="text-2xl font-semibold text-brand">
              {surveyCount}
            </div>
            <p className="mt-1 text-xs text-ink-3">
              Marked with “Use in survey” on the photo below.
            </p>
          </section>
        </div>
      ) : null}

      <AttachmentsSection parentType="eventRecord" parentId={eventId} />
    </section>
  );
}
