import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { useGetVenue } from "../../lib/manifest-convex-react";
import { useRouteRecord } from "../../lib/routeRecord";
import { useDishesExclusiveToVenue } from "../../lib/useDishesByIds";
import { useVenueLogoUrl } from "../../lib/fileStorageClient";
import { TableSkeleton } from "../../ui/primitives";
import { useTenantBranding } from "../admin/tenantBranding";
import { ProposalBrandRow } from "../clients/ProposalBrandRow";
import { venueDetailPath } from "./facilitiesRoutes";
import { packetFacts, packetPhotos } from "./venueInfoPacket";

/**
 * Venue info packet (Venue Partner Playbook sections 06 and 10): what a
 * client gets when we recommend this venue - both logos, the venue facts,
 * what makes it special, our photos there and the dishes only served there.
 * "Save as PDF" is the browser's print to PDF.
 */
export function VenueInfoPacketPage() {
  const { id } = useParams<{ id: string }>();
  const venue = useRouteRecord(useGetVenue, id);
  const { branding, loading: brandLoading } = useTenantBranding();
  const venueLogoUrl = useVenueLogoUrl(id ?? "");
  const exclusive = useDishesExclusiveToVenue(id ?? "");
  const files = useQuery(api.fileStorage.listForParent, {
    parentType: "venue",
    parentId: id ?? "",
  });
  const [leftOut, setLeftOut] = useState<ReadonlySet<string>>(new Set());
  const photos = useMemo(
    () =>
      packetPhotos(
        (files ?? []).map((file) => ({ ...file, _id: String(file._id) })),
      ),
    [files],
  );

  if (venue === undefined) {
    return (
      <div className="card">
        <TableSkeleton rows={5} />
      </div>
    );
  }
  if (venue === null) {
    return <p className="text-ink-3">This venue was not found.</p>;
  }

  const loading =
    brandLoading ||
    venueLogoUrl === undefined ||
    exclusive === undefined ||
    files === undefined;
  const facts = packetFacts(venue);
  const shown = photos.filter((photo) => !leftOut.has(photo._id));
  const dishes = (exclusive ?? []).filter(
    (dish) => dish.deletedAt == null && dish.status !== "retired",
  );
  const toggle = (photoId: string) =>
    setLeftOut((current) => {
      const next = new Set(current);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });

  return (
    <div className="space-y-4">
      <Link
        to={venueDetailPath(String(venue._id))}
        className="text-xs text-brand hover:underline"
      >
        ← Back to {venue.name}
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Venue info packet</h1>
          <p className="max-w-150 text-sm text-ink-2">
            For a client who is choosing a venue. It shows what the client may
            see: no partner grades, no notes about other venues, and no kitchen,
            load-in, restroom or damage photos.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={loading}
          onClick={() => window.print()}
        >
          Save as PDF
        </button>
      </div>

      {loading ? (
        <div className="card">
          <TableSkeleton rows={6} />
        </div>
      ) : (
        <>
          {photos.length > 0 ? (
            <div className="card p-4">
              <p className="text-sm font-semibold">Photos in the packet</p>
              <p className="text-xs text-ink-3">
                Tap a photo to leave it out or put it back. This is not saved.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {photos.map((photo) => {
                  const out = leftOut.has(photo._id);
                  return (
                    <button
                      key={photo._id}
                      type="button"
                      className={`relative h-16 w-16 overflow-hidden rounded-sm border ${
                        out ? "opacity-40" : ""
                      }`}
                      aria-pressed={!out}
                      aria-label={`${out ? "Put back" : "Leave out"} ${photo.fileName}`}
                      onClick={() => toggle(photo._id)}
                    >
                      <img
                        src={photo.url ?? ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {out ? (
                        <span className="absolute inset-x-0 bottom-0 bg-panel/90 text-2xs">
                          Left out
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <section
            className="card print-sheet print-sheet--handout mx-auto max-w-2xl border-t-4 p-6 sm:p-10"
            style={
              venue.brandColor
                ? { borderTopColor: venue.brandColor }
                : undefined
            }
            data-testid="venue-info-packet"
          >
            <div className="flex justify-center">
              <ProposalBrandRow
                brand={{
                  companyName: branding.displayName,
                  companyLogoUrl: branding.logoUrl ?? null,
                  partnerVenue: {
                    name: venue.name,
                    logoUrl: venueLogoUrl ?? null,
                    color: venue.brandColor ?? null,
                  },
                }}
              />
            </div>
            <h2 className="font-display text-center text-3xl">{venue.name}</h2>
            <p className="mt-1 text-center text-sm text-ink-3">
              Catered by {branding.displayName}
            </p>

            {shown[0] ? (
              <img
                src={shown[0].url ?? ""}
                alt={venue.name}
                className="mt-6 aspect-[3/2] w-full rounded-sm object-cover"
              />
            ) : null}

            {facts.length > 0 ? (
              <dl className="mt-6 space-y-3 text-sm">
                {facts.map((fact) => (
                  <div
                    key={fact.label}
                    className="grid grid-cols-1 gap-1 sm:grid-cols-3"
                  >
                    <dt className="font-semibold text-ink-2">{fact.label}</dt>
                    <dd className="text-ink sm:col-span-2">{fact.text}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-6 text-center text-sm text-ink-3">
                Fill in “What makes this venue special” on the venue page to
                describe the venue here.
              </p>
            )}

            {shown.length > 1 ? (
              <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shown.slice(1, 10).map((photo) => (
                  <img
                    key={photo._id}
                    src={photo.url ?? ""}
                    alt=""
                    className="aspect-square w-full rounded-sm object-cover break-inside-avoid"
                  />
                ))}
              </div>
            ) : null}

            {dishes.length > 0 ? (
              <div className="mt-8 break-inside-avoid">
                <h3 className="border-b pb-1 text-center text-xs font-semibold tracking-[0.2em] uppercase">
                  Only at {venue.name}
                </h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {dishes.map((dish) => (
                    <li key={dish._id}>
                      <p className="font-semibold">{dish.name}</p>
                      {dish.description ? (
                        <p className="text-ink-2">{dish.description}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
