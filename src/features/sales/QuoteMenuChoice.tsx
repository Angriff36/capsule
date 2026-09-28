import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { menuPriceText } from "./publicMenuText";

/**
 * The public menu as a choice on the quote form (AC-241). The list and the
 * prices come from the same public menu read as the /menu page, so the quote
 * is priced from what the visitor saw. Menus that do not fit the entered date
 * or guest count say why and cannot be picked.
 */
export function QuoteMenuChoice({
  eventDate,
  guestCount,
  disabled,
}: Readonly<{
  eventDate?: number;
  guestCount?: number;
  disabled: boolean;
}>) {
  const menus = useQuery(api.publicMenu.getPublicMenu, {
    eventDate,
    guestCount,
  });
  if (!menus || menus.length === 0) return null;

  return (
    <div>
      <label
        htmlFor="menuId"
        className="block text-xs font-medium text-ink-2 mb-1"
      >
        Menu
      </label>
      <select
        id="menuId"
        name="menuId"
        className="w-full px-4 py-2 border border-line-2 rounded-sm focus:border-accent"
        disabled={disabled}
      >
        <option value="">No menu yet — help me choose</option>
        {menus.map((menu) => (
          <option
            key={menu.menuId}
            value={menu.menuId}
            disabled={menu.notAvailableBecause.length > 0}
          >
            {menu.name} — {menuPriceText(menu.price)}
            {menu.notAvailableBecause.length > 0
              ? ` (${menu.notAvailableBecause.join("; ")})`
              : ""}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-ink-3">
        See every dish on{" "}
        <a href="/menu" target="_blank" rel="noreferrer" className="underline">
          our menu
        </a>
        .
      </p>
    </div>
  );
}
