import { useState } from "react";
import { useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";
import { dishPriceText, menuPriceText } from "./publicMenuText";
import { QuoteEstimatePanel } from "./QuoteEstimatePanel";
import { useLatestDefined, useMinuteClock } from "../../lib/useMinuteClock";

export type QuotePickInput = {
  menuDishId: Id<"menuDishes">;
  quantity?: number;
};

export type QuotePicksValue = {
  menuId?: Id<"menus">;
  picks: QuotePickInput[];
  extras: QuotePickInput[];
};

type Chosen = Record<string, { on: boolean; portions: string }>;

function toPicks(chosen: Chosen): QuotePickInput[] {
  return Object.entries(chosen)
    .filter(([, c]) => c.on)
    .map(([menuDishId, c]) => {
      const portions = Number(c.portions);
      return Number.isInteger(portions) && portions > 0
        ? { menuDishId: menuDishId as Id<"menuDishes">, quantity: portions }
        : { menuDishId: menuDishId as Id<"menuDishes"> };
    });
}

/**
 * The public menu as a choice on the quote form (AC-241, AC-095). The list
 * and the prices come from the same public menu read as the /menu page, so
 * the quote is priced from what the visitor saw. Menus that do not fit the
 * entered date or guest count say why and cannot be picked. With a menu
 * picked, the visitor can untick dishes and set portions (blank = one per
 * guest), add extras from other menus, and see the estimate.
 */
export function QuoteMenuChoice({
  eventDate,
  guestCount,
  disabled,
  onChange,
}: Readonly<{
  eventDate?: number;
  guestCount?: number;
  disabled: boolean;
  onChange: (value: QuotePicksValue) => void;
}>) {
  const clock = useMinuteClock();
  const menus = useLatestDefined(
    useQuery(api.publicMenu.getPublicMenu, {
      eventDate,
      guestCount,
      clock,
    }),
  );
  const [menuId, setMenuId] = useState<string>("");
  // Dishes of the chosen menu start ticked; unticking one leaves it out.
  const [unticked, setUnticked] = useState<Chosen>({});
  const [extras, setExtras] = useState<Chosen>({});

  if (!menus || menus.length === 0) return null;
  const menu = menus.find((m) => m.menuId === menuId);
  const others = menus.filter(
    (m) => m.menuId !== menuId && m.notAvailableBecause.length === 0,
  );

  const menuPicks = (nextUnticked: Chosen, id: string): QuotePickInput[] => {
    const current = menus.find((m) => m.menuId === id);
    if (!current) return [];
    const chosen: Chosen = {};
    for (const dish of current.dishes) {
      const state = nextUnticked[dish.menuDishId] ?? {
        on: true,
        portions: "",
      };
      chosen[dish.menuDishId] = state;
    }
    return toPicks(chosen);
  };

  const report = (id: string, nextUnticked: Chosen, nextExtras: Chosen) => {
    const extraPicks = toPicks(nextExtras);
    onChange({
      menuId: id ? (id as Id<"menus">) : undefined,
      picks: id ? menuPicks(nextUnticked, id) : [],
      extras: extraPicks,
    });
  };

  const setDish = (
    menuDishId: string,
    change: Partial<{ on: boolean; portions: string }>,
  ) => {
    const next = {
      ...unticked,
      [menuDishId]: {
        ...(unticked[menuDishId] ?? { on: true, portions: "" }),
        ...change,
      },
    };
    setUnticked(next);
    report(menuId, next, extras);
  };

  const setExtra = (
    menuDishId: string,
    change: Partial<{ on: boolean; portions: string }>,
  ) => {
    const next = {
      ...extras,
      [menuDishId]: {
        ...(extras[menuDishId] ?? { on: false, portions: "" }),
        ...change,
      },
    };
    setExtras(next);
    report(menuId, unticked, next);
  };

  const value: QuotePicksValue = {
    menuId: menuId ? (menuId as Id<"menus">) : undefined,
    picks: menuId ? menuPicks(unticked, menuId) : [],
    extras: toPicks(extras),
  };

  return (
    <div className="space-y-4">
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
          value={menuId}
          onChange={(event) => {
            const id = event.target.value;
            setMenuId(id);
            setUnticked({});
            const nextExtras: Chosen = {};
            for (const [key, state] of Object.entries(extras)) {
              if (
                !menus
                  .find((m) => m.menuId === id)
                  ?.dishes.some((d) => d.menuDishId === key)
              ) {
                nextExtras[key] = state;
              }
            }
            setExtras(nextExtras);
            report(id, {}, nextExtras);
          }}
          className="w-full px-4 py-2 border border-line-2 rounded-sm focus:border-accent"
          disabled={disabled}
        >
          <option value="">No menu yet — help me choose</option>
          {menus.map((m) => (
            <option
              key={m.menuId}
              value={m.menuId}
              disabled={m.notAvailableBecause.length > 0}
            >
              {m.name} — {menuPriceText(m.price)}
              {m.notAvailableBecause.length > 0
                ? ` (${m.notAvailableBecause.join("; ")})`
                : ""}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-3">
          See every dish on{" "}
          <a
            href="/menu"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            our menu
          </a>
          .
        </p>
      </div>

      {menu && menu.dishes.length > 0 && (
        <fieldset>
          <legend className="block text-xs font-medium text-ink-2 mb-1">
            Dishes on {menu.name}
          </legend>
          <p className="text-xs text-ink-3 mb-2">
            Untick what you don't want. Leave portions blank for one per guest.
          </p>
          <ul className="divide-y divide-line border border-line rounded-sm">
            {menu.dishes.map((dish) => {
              const state = unticked[dish.menuDishId] ?? {
                on: true,
                portions: "",
              };
              return (
                <QuoteDishRow
                  key={dish.menuDishId}
                  id={dish.menuDishId}
                  name={dish.name}
                  price={dish.price}
                  on={state.on}
                  portions={state.portions}
                  disabled={disabled}
                  onToggle={(on) => setDish(dish.menuDishId, { on })}
                  onPortions={(portions) =>
                    setDish(dish.menuDishId, { portions })
                  }
                />
              );
            })}
          </ul>
        </fieldset>
      )}

      {others.some((m) => m.dishes.length > 0) && (
        <details className="border border-line rounded-sm">
          <summary className="cursor-pointer px-3 py-3 text-xs font-medium text-ink-2">
            Add extras from our other menus
          </summary>
          <div className="px-3 pb-3 space-y-3">
            {others
              .filter((m) => m.dishes.length > 0)
              .map((m) => (
                <fieldset key={m.menuId}>
                  <legend className="text-xs font-medium text-ink-2 py-1">
                    {m.name}
                  </legend>
                  <ul className="divide-y divide-line border border-line rounded-sm">
                    {m.dishes.map((dish) => {
                      const state = extras[dish.menuDishId] ?? {
                        on: false,
                        portions: "",
                      };
                      return (
                        <QuoteDishRow
                          key={dish.menuDishId}
                          id={`extra-${dish.menuDishId}`}
                          name={dish.name}
                          price={dish.price}
                          on={state.on}
                          portions={state.portions}
                          disabled={disabled}
                          onToggle={(on) => setExtra(dish.menuDishId, { on })}
                          onPortions={(portions) =>
                            setExtra(dish.menuDishId, { portions })
                          }
                        />
                      );
                    })}
                  </ul>
                </fieldset>
              ))}
          </div>
        </details>
      )}

      <QuoteEstimatePanel
        eventDate={eventDate}
        guestCount={guestCount}
        value={value}
      />
    </div>
  );
}

function QuoteDishRow({
  id,
  name,
  price,
  on,
  portions,
  disabled,
  onToggle,
  onPortions,
}: Readonly<{
  id: string;
  name: string;
  price: number | null;
  on: boolean;
  portions: string;
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onPortions: (portions: string) => void;
}>) {
  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2 min-h-11">
      <input
        type="checkbox"
        id={`pick-${id}`}
        checked={on}
        onChange={(event) => onToggle(event.target.checked)}
        disabled={disabled}
        className="h-5 w-5"
      />
      <label htmlFor={`pick-${id}`} className="flex-1 min-w-0 text-sm text-ink">
        {name}
        <span className="block text-xs text-ink-3">
          {dishPriceText(price)}
          {price != null ? " each" : ""}
        </span>
      </label>
      {on && (
        <label className="flex items-center gap-2 text-xs text-ink-2">
          Portions
          <input
            type="number"
            min="1"
            inputMode="numeric"
            value={portions}
            onChange={(event) => onPortions(event.target.value)}
            placeholder="Per guest"
            disabled={disabled}
            className="w-24 px-2 py-2 border border-line-2 rounded-sm"
          />
        </label>
      )}
    </li>
  );
}
