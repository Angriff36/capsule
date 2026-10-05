import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { ErrorState, TableSkeleton } from "../../ui/primitives";
import { ProposalBrandRow } from "../clients/ProposalBrandRow";

/**
 * Shared event gallery for a venue (Venue Partner Playbook section 06).
 * Public route (no sign-in) at /venue-gallery/:token: the venue sees our
 * photos from events at their place and saves them for their own posts.
 * The token comes in as a prop (App renders this page off useMatch).
 */
export function SharedVenueGalleryPage({ token }: { token: string }) {
  const data = useQuery(api.venueGallery.getShared, token ? { token } : "skip");

  if (data === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <TableSkeleton rows={3} />
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="w-full max-w-2xl p-8">
          <ErrorState
            title="This gallery link isn't working"
            detail="The link was turned off or replaced. Ask your caterer for a new link."
          />
        </div>
      </div>
    );
  }

  const company = data.companyName ?? "your caterer";
  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <main
        className="mx-auto max-w-5xl space-y-6 border-t-4 bg-panel p-5 sm:p-8"
        style={
          data.venueColor ? { borderTopColor: data.venueColor } : undefined
        }
        data-testid="shared-venue-gallery"
      >
        <div className="flex justify-center">
          <ProposalBrandRow
            brand={{
              companyName: data.companyName,
              companyLogoUrl: data.companyLogoUrl,
              partnerVenue: {
                name: data.venueName,
                logoUrl: data.venueLogoUrl,
                color: data.venueColor,
              },
            }}
          />
        </div>
        <div className="text-center">
          <h1 className="font-display text-3xl">{data.venueName}</h1>
          <p className="mt-1 text-sm text-ink-2">
            Photos from events catered by {company}. Save any photo for your own
            posts, and please credit {company} when you share it.
          </p>
        </div>

        {data.photos.length === 0 ? (
          <p className="text-center text-sm text-ink-3">
            No photos here yet. New photos show up on this page as soon as they
            are added.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.photos.map((photo) => (
              <li key={photo.id} className="space-y-2">
                <img
                  src={photo.url}
                  alt={photo.caption || data.venueName}
                  className="aspect-[4/3] w-full rounded-sm object-cover"
                  loading="lazy"
                />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-ink-2">{photo.caption}</p>
                  <a
                    className="btn btn-secondary btn-sm"
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    download
                  >
                    Save photo
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
