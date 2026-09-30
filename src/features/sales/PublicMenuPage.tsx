import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import {
  allergenText,
  dishPriceText,
  guestRangeText,
  menuPriceText,
  seasonText,
} from "./publicMenuText";
import { useLatestDefined, useMinuteClock } from "../../lib/useMinuteClock";

/**
 * Public menu (spec CF-4-2). Anyone can open it; it lists the published
 * menus with today's sell prices, what is in each dish, allergens, guest
 * minimums, service style and season. It reads the same catalog proposals
 * price from, so a quote never shows a different price.
 */
export function PublicMenuPage() {
  const clock = useMinuteClock();
  const menus = useLatestDefined(
    useQuery(api.publicMenu.getPublicMenu, { clock }),
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-stone-100">
      <header className="bg-panel shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink">Our menus</h1>
          <a href="/quote" className="btn btn-primary">
            Request a quote
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
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
                  {guestRangeText(menu.minGuests, menu.maxGuests)}
                  {season ? ` · ${season}` : ""}
                </p>
                {menu.description ? (
                  <p className="mt-3 text-ink-2">{menu.description}</p>
                ) : null}
                <ul className="mt-4 divide-y divide-line">
                  {menu.dishes.map((dish) => (
                    <li key={dish.menuDishId} className="py-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="font-medium text-ink">
                          {dish.name}
                        </span>
                        <span className="text-ink-2 whitespace-nowrap">
                          {dishPriceText(dish.price)}
                        </span>
                      </div>
                      {dish.description ? (
                        <p className="text-ink-2">{dish.description}</p>
                      ) : null}
                      <p className="text-xs text-ink-3">
                        {[dish.course, dish.serviceStyle, ...dish.dietaryTags]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {dish.allergens.length > 0 ? (
                        <p className="text-xs text-ink-3">
                          Contains:{" "}
                          {dish.allergens.map(allergenText).join(", ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </main>
    </div>
  );
}
