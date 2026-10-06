import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import {
  allergenText,
  courseGroups,
  DIET_MARKS,
  dietMark,
  dishPriceText,
  guestRangeText,
  isPickOneCourse,
  menuPriceText,
  seasonText,
  serverRatioText,
} from "./publicMenuText";
import { useLatestDefined, useMinuteClock } from "../../lib/useMinuteClock";
import { formatStatusLabel } from "../../lib/statusLabels";

/**
 * Public menu (spec CF-4-2). Anyone can open it; it lists the published
 * menus with today's sell prices, what is in each dish, allergens, guest
 * minimums, service style and season. It reads the same catalog proposals
 * price from, so a quote never shows a different price.
 *
 * It reads like the company's printed menu book (work/mangia-menu-catalog-
 * redesign.pdf): dishes under course headings, short diet marks with a key,
 * the company name and logo, and "Save as PDF" to hand it out.
 */
export function PublicMenuPage() {
  const clock = useMinuteClock();
  const menus = useLatestDefined(
    useQuery(api.publicMenu.getPublicMenu, { clock }),
  );
  const company = useQuery(api.publicMenu.getPublicMenuCompany, {});
  const usedMarks = DIET_MARKS.filter((entry) =>
    (menus ?? []).some((menu) =>
      menu.dishes.some((dish) =>
        dish.dietaryTags.some((tag) => dietMark(tag)?.mark === entry.mark),
      ),
    ),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      <header className="bg-panel shadow-sm print:hidden">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-ink">Our menus</h1>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={!menus?.length}
              onClick={() => window.print()}
            >
              Save as PDF
            </button>
            <a href="/quote" className="btn btn-primary">
              Request a quote
            </a>
          </div>
        </div>
      </header>

      <main className="print-sheet print-sheet--handout max-w-3xl mx-auto px-4 py-8 space-y-6">
        {company ? (
          <div className="flex items-center gap-3">
            {company.logoUrl ? (
              <img
                src={company.logoUrl}
                alt=""
                className="h-12 w-auto max-w-40 object-contain"
              />
            ) : null}
            <p className="text-lg font-semibold text-ink">{company.name}</p>
          </div>
        ) : null}

        {menus === undefined ? (
          <p className="text-ink-2">Loading the menu…</p>
        ) : menus.length === 0 ? (
          <div className="bg-panel rounded-sm shadow-lg p-6">
            <p className="text-ink-2">
              Our menu is not online yet. Request a quote and we will send you
              our current menu and prices.
            </p>
          </div>
        ) : (
          menus.map((menu) => {
            const season = seasonText(menu.availableFrom, menu.availableUntil);
            const styles = new Set(menu.dishes.map((d) => d.serviceStyle));
            const sharedStyle =
              styles.size === 1 ? ([...styles][0] ?? null) : null;
            return (
              <section
                key={menu.menuId}
                className="bg-panel rounded-sm shadow-lg p-6 md:p-8"
                aria-labelledby={`menu-${menu.menuId}`}
              >
                {menu.category ? (
                  <p className="text-xs font-medium text-ink-3 uppercase">
                    {menu.category}
                  </p>
                ) : null}
                <h2
                  id={`menu-${menu.menuId}`}
                  className="text-lg font-semibold text-ink"
                >
                  {menu.name}
                </h2>
                <p className="mt-1 font-medium text-ink">
                  {menuPriceText(menu.price)}
                </p>
                <p className="mt-1 text-xs text-ink-3">
                  {[
                    sharedStyle ? formatStatusLabel(sharedStyle) : null,
                    serverRatioText(menu.guestsPerServer),
                    guestRangeText(menu.minGuests, menu.maxGuests),
                    season,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {menu.description ? (
                  <p className="mt-3 text-ink-2">{menu.description}</p>
                ) : null}
                {courseGroups(menu.dishes).map((group) => {
                  const pickOne =
                    group.dishes.length > 1 &&
                    isPickOneCourse(group.course, menu.pickOneCourses);
                  return (
                    <div key={group.course ?? ""} className="mt-4">
                      {group.course ? (
                        <h3 className="text-xs font-semibold text-ink-3 uppercase">
                          {group.course}
                        </h3>
                      ) : null}
                      {pickOne ? (
                        <p className="text-xs italic text-ink-2">
                          Each guest picks one
                        </p>
                      ) : null}
                      <ul
                        className={pickOne ? undefined : "divide-y divide-line"}
                      >
                        {group.dishes.map((dish, index) => {
                          const marks = dish.dietaryTags
                            .map(dietMark)
                            .filter((mark) => mark !== null);
                          const otherTags = dish.dietaryTags.filter(
                            (tag) => dietMark(tag) === null,
                          );
                          const details = [
                            sharedStyle || !dish.serviceStyle
                              ? null
                              : formatStatusLabel(dish.serviceStyle),
                            ...otherTags,
                          ].filter(Boolean);
                          return (
                            <li key={dish.menuDishId} className="py-3">
                              {pickOne && index > 0 ? (
                                <p className="pb-3 text-center text-xs italic text-ink-3">
                                  or
                                </p>
                              ) : null}
                              <div className="flex items-baseline justify-between gap-4">
                                <span className="font-medium text-ink">
                                  {dish.name}
                                  {marks.map((mark) => (
                                    <span
                                      key={mark.mark}
                                      className="chip chip-tone-mute ml-2"
                                      title={mark.label}
                                      aria-label={mark.label}
                                    >
                                      {mark.mark}
                                    </span>
                                  ))}
                                </span>
                                <span className="text-ink-2 whitespace-nowrap">
                                  {dishPriceText(dish.price)}
                                </span>
                              </div>
                              {dish.description ? (
                                <p className="text-ink-2">{dish.description}</p>
                              ) : null}
                              {details.length > 0 ? (
                                <p className="text-xs text-ink-3">
                                  {details.join(" · ")}
                                </p>
                              ) : null}
                              {dish.allergens.length > 0 ? (
                                <p className="text-xs text-ink-3">
                                  Contains:{" "}
                                  {dish.allergens.map(allergenText).join(", ")}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </section>
            );
          })
        )}

        {menus && menus.length > 0 ? (
          <section
            className="bg-panel rounded-sm shadow-lg p-6 md:p-8 text-center"
            aria-labelledby="menu-notes"
          >
            <h2 id="menu-notes" className="text-lg font-semibold text-ink">
              We cater to everyone
            </h2>
            {usedMarks.length > 0 ? (
              <p className="mt-3 flex flex-wrap justify-center gap-2">
                {usedMarks.map((entry) => (
                  <span key={entry.mark} className="chip chip-tone-mute">
                    {entry.mark} = {entry.label}
                  </span>
                ))}
              </p>
            ) : null}
            <p className="mt-3 text-ink-2">
              Tell us about any allergies or diets and we will plan for them.
            </p>
            <p className="text-ink-2">
              Prices depend on your guest count and menu choices. Your quote
              shows the final price, with tax.
            </p>
            {company ? (
              <div className="mt-6 border-t border-line pt-4">
                <p className="font-semibold text-ink">{company.name}</p>
                {company.address ? (
                  <p className="text-xs text-ink-3">{company.address}</p>
                ) : null}
                {company.phone || company.website ? (
                  <p className="text-ink">
                    {[company.phone, company.website]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
