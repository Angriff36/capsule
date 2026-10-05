import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api, type Doc } from "../../lib/api";
import { formatDate } from "../../lib/format";
import {
  useAttachmentRemove,
  useCreateAttachment,
  useVenueSetGalleryToken,
} from "../../lib/manifest-convex-react";
import { Section } from "../../ui/primitives";
import {
  classifyCommandFailure,
  type CommandFailure,
} from "../events/CommandFailure";
import { FailureBanner } from "../events/FailureBanner";
import {
  galleryCaption,
  galleryFileName,
  isGalleryFile,
  newGalleryToken,
  sortForGallery,
  venueGalleryPath,
} from "./venueGallery";

/**
 * Shared event gallery (Venue Partner Playbook section 06): pick photos from
 * our events here and give the venue one link to see and save them.
 */
export function VenueEventGalleryPanel({ venue }: { venue: Doc<"venues"> }) {
  const venueId = String(venue._id);
  const eventPhotos = useQuery(api.venueGallery.eventPhotos, {
    venueId: venue._id,
  });
  const files = useQuery(api.fileStorage.listForParent, {
    parentType: "venue",
    parentId: venueId,
  });
  const createAttachment = useCreateAttachment();
  const removeAttachment = useAttachmentRemove();
  const setGalleryToken = useVenueSetGalleryToken();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [copied, setCopied] = useState(false);

  const inGallery = useMemo(
    () =>
      (files ?? []).filter(
        (file) =>
          isGalleryFile(file.fileName) &&
          String(file.contentType).startsWith("image/"),
      ),
    [files],
  );
  const pickedStorage = useMemo(
    () => new Set(inGallery.map((file) => file.storageId)),
    [inGallery],
  );
  const candidates = useMemo(
    () => sortForGallery(eventPhotos ?? []),
    [eventPhotos],
  );

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  const link = venue.galleryToken
    ? `${window.location.origin}${venueGalleryPath(venue.galleryToken)}`
    : null;
  const setToken = (token: string | undefined) =>
    run("link", () =>
      setGalleryToken({
        docId: venue._id,
        version: venue.version,
        galleryToken: token,
      }),
    );

  return (
    <Section title="Shared event gallery">
      <div className="space-y-4 p-4" data-testid="venue-event-gallery">
        {failure ? <FailureBanner failure={failure} /> : null}
        <p className="text-sm text-ink-3">
          Pick photos from our events here. The venue opens one link to see and
          save them for their own posts. Food photos are listed first.
        </p>

        <div className="space-y-2 rounded-sm border border-line-2 bg-panel p-3">
          {link ? (
            <>
              <p className="text-sm font-semibold text-ink">
                Link for the venue
              </p>
              <input
                className="input w-full text-xs"
                readOnly
                value={link}
                aria-label="Gallery link for the venue"
                onFocus={(event) => event.currentTarget.select()}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link);
                    setCopied(true);
                  }}
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
                <a
                  className="btn btn-ghost btn-sm"
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open
                </a>
                <button
                  className="btn btn-ghost btn-sm"
                  type="button"
                  disabled={busy != null}
                  onClick={() => {
                    setCopied(false);
                    void setToken(undefined);
                  }}
                >
                  Stop sharing
                </button>
              </div>
              <p className="text-xs text-ink-3">
                Anyone with this link sees the photos below. Stop sharing turns
                the link off.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-3">
                Not shared with the venue yet.
              </p>
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={busy != null}
                onClick={() => void setToken(newGalleryToken())}
              >
                {busy === "link" ? "Making link…" : "Make a link for the venue"}
              </button>
            </>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">
            In the gallery · {inGallery.length}
          </p>
          {inGallery.length === 0 ? (
            <p className="text-sm text-ink-3">
              No photos yet. Add some from the events below.
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {inGallery.map((file) => (
                <li key={file._id} className="space-y-1">
                  <img
                    src={file.url ?? ""}
                    alt=""
                    className="aspect-square w-full rounded-sm object-cover"
                  />
                  <button
                    className="btn btn-ghost btn-sm w-full"
                    type="button"
                    disabled={busy != null}
                    onClick={() =>
                      void run(`out:${file._id}`, () =>
                        removeAttachment({
                          docId: file._id,
                          version: file.version,
                        }),
                      )
                    }
                  >
                    Take out
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-ink">
            Photos from our events here
          </p>
          {eventPhotos === undefined ? (
            <p className="text-sm text-ink-3">Loading photos…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-ink-3">
              No event photos yet. Photos added on an event's Photos tab show up
              here.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {candidates.map((photo) => {
                const picked = pickedStorage.has(photo.storageId);
                return (
                  <li key={photo.attachmentId} className="space-y-1">
                    <img
                      src={photo.url ?? ""}
                      alt=""
                      className="aspect-square w-full rounded-sm object-cover"
                    />
                    <p className="truncate text-xs text-ink-2">
                      {photo.eventTitle}
                      {photo.eventStartsAt
                        ? ` · ${formatDate(photo.eventStartsAt)}`
                        : ""}
                    </p>
                    <button
                      className={`btn btn-sm w-full ${picked ? "btn-ghost" : "btn-secondary"}`}
                      type="button"
                      disabled={picked || busy != null}
                      onClick={() =>
                        void run(`add:${photo.attachmentId}`, () =>
                          createAttachment({
                            parentType: "venue",
                            parentId: venueId,
                            fileName: galleryFileName(
                              galleryCaption(
                                photo.eventType,
                                photo.eventStartsAt,
                              ),
                              photo.fileName,
                            ),
                            contentType: photo.contentType,
                            fileSize: photo.fileSize,
                            storageId: photo.storageId,
                          }),
                        )
                      }
                    >
                      {picked
                        ? "✓ In the gallery"
                        : busy === `add:${photo.attachmentId}`
                          ? "Adding…"
                          : "Add to gallery"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Section>
  );
}
