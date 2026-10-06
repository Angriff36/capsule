import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  useGetVenue,
  useListMenu,
  useListMenuDish,
} from "../../lib/manifest-convex-react";
import { useRouteRecord } from "../../lib/routeRecord";
import {
  useDishesByIds,
  useDishesExclusiveToVenue,
} from "../../lib/useDishesByIds";
import { useStorageUrls, useVenueLogoUrl } from "../../lib/fileStorageClient";
import { TableSkeleton } from "../../ui/primitives";
import { useTenantBranding } from "../admin/tenantBranding";
import { ProposalBrandRow } from "../clients/ProposalBrandRow";
import { venueDetailPath } from "./facilitiesRoutes";
import { dietaryLine, menuCardSections } from "./venueMenuCard";

/**
 * Printable venue menu card (Venue Partner Playbook section 06): company logo
 * first, the venue logo next to it at the same size, the venue colour as the
 * top line, then the dishes only made for this venue and one chosen menu.
 * The chosen menu sits in the page address, so a copied link opens the same
 * card. "Save as PDF" is the browser's print to PDF.
 */
export function VenueMenuCardPage() {
  const { id } = useParams<{ id: string }>();
  const venue = useRouteRecord(useGetVenue, id);
  const [params, setParams] = useSearchParams();
  const menuId = params.get("menu") ?? "";
  const { branding, loading: brandLoading } = useTenantBranding();
  const venueLogoUrl = useVenueLogoUrl(id ?? "");
  const exclusive = useDishesExclusiveToVenue(id ?? "");
  const menus = useListMenu();
  const menuLines = useListMenuDish();
  const chosenLines = useMemo(
    () =>
      menuId
        ? (menuLines ?? []).filter(
            (line) => line.deletedAt == null && line.menuId === menuId,
          )
        : [],
    [menuId, menuLines],
  );
  const menuDishes = useDishesByIds(chosenLines.map((line) => line.dishId));

  const liveMenus = (menus ?? [])
    .filter((menu) => menu.deletedAt == null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const menuName = liveMenus.find((menu) => menu._id === menuId)?.name ?? null;

  const sections = useMemo(
    () =>
      venue
        ? menuCardSections({
            venueName: venue.name,
            exclusiveDishes: (exclusive ?? []).map((dish) => ({
              ...dish,
              _id: String(dish._id),
            })),
            menuId,
            menuName,
            menuLines: chosenLines.map((line) => ({
              ...line,
              menuId: String(line.menuId),
              dishId: String(line.dishId),
            })),
            menuDishes: (menuDishes ?? []).map((dish) => ({
              ...dish,
              _id: String(dish._id),
            })),
          })
        : [],
    [venue, exclusive, menuId, menuName, chosenLines, menuDishes],
  );
  const pictureUrls = useStorageUrls(
    sections.flatMap((section) =>
      section.dishes.map((dish) => dish.primaryImageStorageId ?? ""),
    ),
  );
  const pictureOf = (storageId?: string | null) =>
    storageId ? (pictureUrls?.[storageId] ?? null) : null;

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
    menus === undefined ||
    menuLines === undefined ||
    (!!menuId && menuDishes === undefined);

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
          <h1 className="text-xl font-bold">Venue menu card</h1>
          <p className="max-w-150 text-sm text-ink-2">
            For the tables at {venue.name} and for proposals there. Dishes
            offered only at this venue come first; pick a menu to add its
            dishes.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={loading || sections.length === 0}
          onClick={() => window.print()}
        >
          Save as PDF
        </button>
      </div>
      <label className="field-label max-w-sm">
        Add a menu
        <select
          className="input"
          value={menuId}
          onChange={(event) =>
            setParams(event.target.value ? { menu: event.target.value } : {}, {
              replace: true,
            })
          }
        >
          <option value="">Only the dishes made for this venue</option>
          {liveMenus.map((menu) => (
            <option key={menu._id} value={menu._id}>
              {menu.name}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <div className="card">
          <TableSkeleton rows={6} />
        </div>
      ) : sections.length === 0 ? (
        <div className="component-filter-empty">
          <p>
            No dishes on this card yet. Pick a menu above, or open a dish and
            set “Offered at” to this venue.
          </p>
        </div>
      ) : (
        <section
          className="card print-sheet print-sheet--handout mx-auto max-w-2xl border-t-4 p-6 sm:p-10"
          style={
            venue.brandColor ? { borderTopColor: venue.brandColor } : undefined
          }
          data-testid="venue-menu-card"
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
          <h2 className="font-display text-center text-3xl">
            {menuName ?? "Menu"}
          </h2>
          <p className="mt-1 text-center text-sm text-ink-3">at {venue.name}</p>
          {sections.map((section) => (
            <div key={section.title} className="mt-8">
              <h3
                className="border-b pb-1 text-center text-xs font-semibold tracking-[0.2em] uppercase"
                style={
                  venue.brandColor
                    ? { borderColor: venue.brandColor }
                    : undefined
                }
              >
                {section.title}
              </h3>
              <ul className="mt-4 space-y-5">
                {section.dishes.map((dish) => {
                  const picture = pictureOf(dish.primaryImageStorageId);
                  const dietary = dietaryLine(dish.dietaryTags);
                  return (
                    <li
                      key={dish._id}
                      className="flex items-start gap-4 break-inside-avoid"
                    >
                      {picture ? (
                        <img
                          src={picture}
                          alt=""
                          className="h-16 w-16 shrink-0 rounded-sm object-cover"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 text-center sm:text-left">
                        <p className="font-semibold">{dish.name}</p>
                        {dish.description ? (
                          <p className="text-sm text-ink-2">
                            {dish.description}
                          </p>
                        ) : null}
                        {dietary ? (
                          <p className="mt-0.5 text-xs text-ink-3">{dietary}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="mt-10 text-center text-xs text-ink-3">
            Please tell your server about any food allergies.
          </p>
        </section>
      )}
    </div>
  );
}
