import { formatDate, formatTime } from "../../lib/format";
import { Skeleton } from "../../ui/primitives";

export type EventPhotoRow = {
  readonly _id: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly uploadedAt?: number | null;
  readonly evidenceType?: string | null;
  readonly inFeedbackSurvey?: boolean | null;
  readonly url?: string | null;
};

export type EventPhotoAlbum = {
  readonly value: string;
  readonly label: string;
  readonly hint: string;
  readonly count: number;
  readonly cover: string | null;
  readonly latestAt: number | null;
};

/** Category tiles: one per photo type, covered by its most recent photo. */
export function EventPhotoAlbumGrid({
  albums,
  loading,
}: {
  readonly albums: readonly EventPhotoAlbum[];
  readonly loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
    );
  }
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {albums.map((album) => (
        <article
          key={album.value}
          className="card overflow-hidden"
          data-testid={`event-photo-album-${album.value}`}
        >
          <div className="relative aspect-[4/3] bg-inset">
            {album.cover ? (
              <img
                src={album.cover}
                alt={`${album.label} photos`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="grid h-full place-items-center px-3 text-center text-sm text-ink-3">
                No {album.label.toLowerCase()} photos yet
              </div>
            )}
            <span className="absolute top-2 right-2 rounded-sm bg-brand px-2.5 py-1 text-xs font-semibold text-on-brand">
              {album.count}
            </span>
          </div>
          <div className="p-4">
            <h4 className="font-semibold text-ink">{album.label}</h4>
            <p className="mt-1 text-xs text-ink-3">{album.hint}</p>
            <p className="mt-2 text-xs text-ink-3">
              {album.latestAt != null
                ? `Last added ${formatDate(album.latestAt)} · ${formatTime(album.latestAt)}`
                : "Nothing added yet"}
            </p>
          </div>
        </article>
      ))}
    </div>
  );
}

/** Most recent uploads, newest first — the design's "Upload Activity" list. */
export function EventPhotoActivity({
  photos,
  labelFor,
}: {
  readonly photos: readonly EventPhotoRow[];
  readonly labelFor: (evidenceType?: string | null) => string;
}) {
  if (photos.length === 0) return null;
  return (
    <section className="card p-5" aria-label="Upload activity">
      <h3 className="mb-4 text-base font-semibold text-ink">Upload activity</h3>
      <ul className="flex flex-col">
        {photos.map((photo) => (
          <li
            key={photo._id}
            className="flex items-start gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0 [&+li]:pt-3"
          >
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-sm bg-inset">
              {photo.url ? (
                <img
                  src={photo.url}
                  alt=""
                  className="h-8 w-8 object-cover"
                  loading="lazy"
                />
              ) : null}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base text-ink">
                <span className="font-medium">{photo.fileName}</span>
                <span className="text-ink-3"> added to </span>
                <span className="font-medium text-brand">
                  {labelFor(photo.evidenceType)}
                </span>
              </p>
              <p className="mt-1 text-xs text-ink-3">
                {photo.uploadedAt != null
                  ? `${formatDate(photo.uploadedAt)} · ${formatTime(photo.uploadedAt)}`
                  : "Time not recorded"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
