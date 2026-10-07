import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useListDishComponent,
  useListDishIngredient,
  useListIngredient,
  useListMenu,
  useListMenuDish,
  useListComponent,
  useListComponentIngredient,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { formatCountNoun, formatDate } from "../../lib/format";
import {
  CULINARY_ALLERGENS,
  type CulinaryAllergenCode,
} from "./CulinaryAllergenVocabulary";
import { deriveDishAllergens } from "./dishAllergens";
import { KitchenBookNav } from "./KitchenBookNav";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import { useMenuLinesForEvents } from "../facilities/useMenuLinesFor";
import { useDishesByIds } from "../../lib/useDishesByIds";

const ALLERGENS = CULINARY_ALLERGENS;

type AllergenCode = CulinaryAllergenCode;

type MatrixRecord = {
  _id: string;
  deletedAt?: number | string | null;
  [key: string]: unknown;
};

/**
 * Dish rows for the matrix: allergen flags unioned from the full recipe —
 * direct DishIngredient lines AND component lines (dish → DishComponent →
 * ComponentIngredient → Ingredient.allergens) — plus dish-level declared
 * allergenSummary. Each flagged cell records its contributing sources for
 * disclosure tooltips. Derivation lives in dishAllergens.ts, shared with
 * the Event Day menu.
 */
export function deriveAllergenRows(input: {
  dishIds: string[];
  dishes: MatrixRecord[];
  dishIngredients: MatrixRecord[];
  dishComponents: MatrixRecord[];
  componentIngredients: MatrixRecord[];
  ingredients: MatrixRecord[];
  components?: MatrixRecord[];
}) {
  return [...new Set(input.dishIds)]
    .map((dishId) => {
      const dish = input.dishes.find((item) => item._id === dishId);
      if (!dish || dish.deletedAt != null) return null;
      const report = deriveDishAllergens(dish, input);
      // Recipes on the dish with no ingredient lines: their allergens are
      // simply not known yet.
      const recipeId = String(dish.recipeDishId ?? dish._id);
      const componentIds = input.dishComponents
        .filter(
          (line) => line.deletedAt == null && String(line.dishId) === recipeId,
        )
        .map((line) => String(line.componentId));
      const unwritten = componentIds.filter(
        (id) =>
          !input.componentIngredients.some(
            (line) => line.deletedAt == null && String(line.componentId) === id,
          ),
      ).length;
      const unknown =
        report.lineCount === 0 || unwritten > 0 || report.unflaggedCount > 0;
      return { dish, sources: report.sources, unwritten, unknown, report };
    })
    .filter((row) => row != null)
    .sort((a, b) => String(a.dish.name).localeCompare(String(b.dish.name)));
}

export function AllergenMatrixPage() {
  const [params, setParams] = useSearchParams();
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  // Recipes, for allergens marked on the recipe itself.
  const components = useListComponent();

  const menuId = params.get("menu") ?? "";
  const eventId = params.get("event") ?? "";
  const eventDishes = useMenuLinesForEvents([eventId]);
  // Only the chosen menu's or event's dishes, never the whole dish list.
  const dishes = useDishesByIds(
    menuId
      ? menuDishes
          ?.filter((line) => line.deletedAt == null && line.menuId === menuId)
          .map((line) => line.dishId)
      : eventDishes?.map((line) => line.dishId),
  );
  const events = usePickerAndNamedEvents([eventId]);
  const scopeValue = menuId
    ? `menu:${menuId}`
    : eventId
      ? `event:${eventId}`
      : "";

  const loading =
    menus === undefined ||
    events === undefined ||
    menuDishes === undefined ||
    eventDishes === undefined ||
    dishes === undefined ||
    dishIngredients === undefined ||
    dishComponents === undefined ||
    componentIngredients === undefined ||
    ingredients === undefined;

  const liveMenus = (menus ?? []).filter((menu) => menu.deletedAt == null);
  const liveEvents = (events ?? []).filter((event) => event.deletedAt == null);

  const scopeName = menuId
    ? (liveMenus.find((menu) => menu._id === menuId)?.name ?? "Unknown menu")
    : eventId
      ? (liveEvents.find((event) => event._id === eventId)?.title ??
        "Unknown event")
      : "";

  const rows = useMemo(() => {
    if (loading || !scopeValue) return [];
    const dishIds = menuId
      ? (menuDishes ?? [])
          .filter((line) => line.deletedAt == null && line.menuId === menuId)
          .map((line) => String(line.dishId))
      : (eventDishes ?? [])
          .filter((line) => line.deletedAt == null && line.eventId === eventId)
          .map((line) => String(line.dishId));

    return deriveAllergenRows({
      dishIds,
      dishes: dishes ?? [],
      dishIngredients: dishIngredients ?? [],
      dishComponents: dishComponents ?? [],
      componentIngredients: componentIngredients ?? [],
      ingredients: ingredients ?? [],
      components: components ?? [],
    });
  }, [
    components,
    loading,
    scopeValue,
    menuId,
    eventId,
    menuDishes,
    eventDishes,
    dishes,
    dishIngredients,
    dishComponents,
    componentIngredients,
    ingredients,
  ]);

  const selectScope = (value: string) => {
    const [kind, id] = value.split(":");
    setParams(id ? { [kind]: id } : {}, { replace: true });
  };

  return (
    <div className="component-book-stage culinary-studio">
      <header className="component-book-masthead">
        <div>
          <p className="eyebrow">Culinary book · Allergens</p>
          <h1 className="display-title mt-2">Allergen matrix</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Every dish on a menu or event against the major food allergens,
            auto-populated from the allergen flags of every recipe ingredient.
            Print for client disclosure or health inspection.
          </p>
        </div>
        <div className="component-book-masthead-actions">
          <button
            className="btn btn-primary"
            disabled={!scopeValue || rows.length === 0}
            onClick={() => window.print()}
          >
            Export PDF
          </button>
        </div>
      </header>

      <KitchenBookNav />

      <div className="allergen-matrix-toolbar">
        <label className="field-label">
          Menu or event
          <select
            className="input"
            value={scopeValue}
            onChange={(event) => selectScope(event.target.value)}
          >
            <option value="">Select a menu or event…</option>
            <optgroup label="Menus">
              {liveMenus.map((menu) => (
                <option key={menu._id} value={`menu:${menu._id}`}>
                  {menu.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Events">
              {liveEvents.map((event) => (
                <option key={event._id} value={`event:${event._id}`}>
                  {event.title}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="card mt-4">
          <TableSkeleton rows={7} />
        </div>
      ) : !scopeValue ? (
        <div className="component-filter-empty mt-4">
          <p>Select a menu or event to build its allergen matrix.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="component-filter-empty mt-4">
          <p>No dishes on this {menuId ? "menu" : "event"} yet.</p>
        </div>
      ) : (
        <section className="card print-sheet mt-4">
          <header className="allergen-matrix-heading">
            <div>
              <p className="eyebrow">Allergen disclosure</p>
              <h2 className="font-display mt-1 text-2xl">{scopeName}</h2>
            </div>
            <span className="font-mono text-xs text-ink-3">
              Prepared {formatDate(Date.now())} ·{" "}
              {formatCountNoun(rows.length, "dish", "dishes")}
            </span>
          </header>
          <div className="supply-table-wrap">
            <table className="supply-table allergen-matrix-table">
              <thead>
                <tr>
                  <th>Dish</th>
                  {ALLERGENS.map((allergen) => (
                    <th key={allergen.code} className="allergen-col">
                      {allergen.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ dish, sources, unknown, unwritten, report }) => (
                  <tr key={dish._id}>
                    <td>
                      <strong>{String(dish.name)}</strong>
                      {dish.course ? (
                        <small>{String(dish.course)}</small>
                      ) : null}
                      {unknown ? (
                        <small className="text-warn">
                          {unwritten > 0
                            ? `${unwritten} recipe${unwritten === 1 ? "" : "s"} not written — allergens may be missing`
                            : report.lineCount === 0
                              ? "No ingredients on file — allergens not known"
                              : "Some ingredients have no allergen check"}
                        </small>
                      ) : null}
                    </td>
                    {ALLERGENS.map((allergen) => {
                      const from = sources.get(allergen.code);
                      return (
                        <td
                          key={allergen.code}
                          className="allergen-cell"
                          title={
                            from
                              ? `${allergen.label}: ${from.join(", ")}`
                              : undefined
                          }
                        >
                          {from ? (
                            <span
                              className="allergen-flag"
                              aria-label="Contains"
                            >
                              ●
                            </span>
                          ) : unknown ? (
                            <span
                              className="allergen-clear"
                              aria-label="Not known"
                            >
                              ?
                            </span>
                          ) : (
                            <span
                              className="allergen-clear"
                              aria-label="Not flagged"
                            >
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="allergen-matrix-footnote">
            Flags derive from the allergen classifications of every recipe
            ingredient (direct lines and components) plus dish-level
            declarations. Unflagged cells mean no allergen is on file, not a
            certified absence — verify with the kitchen before guaranteeing
            allergen-free service.
          </p>
        </section>
      )}
    </div>
  );
}
