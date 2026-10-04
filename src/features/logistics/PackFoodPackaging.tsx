import {
  useListComponent,
  useListDishComponent,
  useListStylePackaging,
} from "../../lib/manifest-convex-react";
import { useDishesByIds } from "../../lib/useDishesByIds";
import { useEventMenuLines } from "../../lib/useEventMenuLines";
import { EventDishPackaging } from "../events/EventDishPackaging";
import {
  packagingForEvent,
  type StylePackagingRow,
} from "../kitchen/stylePackaging";

/**
 * How each dish on the event's menu is packed for the event's service style,
 * so the packer reads the drop-off line on a drop-off and the bring-hot line
 * on a bring-hot event — never the others.
 */
export function PackFoodPackaging({
  eventId,
  serviceStyleId,
  serviceStyleName,
}: {
  eventId: string;
  serviceStyleId: string | null | undefined;
  serviceStyleName?: string;
}) {
  const lines = useEventMenuLines(eventId);
  const packaging = useListStylePackaging() as StylePackagingRow[] | undefined;
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const menu = (lines ?? []).filter(
    (line) => line.deletedAt == null && line.eventId === eventId,
  );
  const dishes = useDishesByIds(
    lines === undefined ? undefined : menu.map((line) => line.dishId),
  );
  if (lines === undefined || packaging === undefined) return null;

  const componentName = new Map(
    (components ?? []).map((row) => [String(row._id), row.name]),
  );
  const rows = [...new Set(menu.map((line) => String(line.dishId)))].map(
    (dishId) => {
      const dish = dishes?.find((row) => String(row._id) === dishId) as
        | {
            name?: string;
            versionOfDishId?: string | null;
            recipeDishId?: string | null;
          }
        | undefined;
      // A version may cook from its main dish's recipe (recipeDishId).
      const recipeId = dish?.recipeDishId ?? dishId;
      const recipes = (dishComponents ?? [])
        .filter((row) => row.deletedAt == null && row.dishId === recipeId)
        .map((row) => ({
          id: String(row.componentId),
          name: componentName.get(String(row.componentId)) ?? "Recipe",
        }));
      const mainDishId = dish?.versionOfDishId ?? null;
      const found = packagingForEvent(
        packaging,
        serviceStyleId,
        dishId,
        recipes.map((recipe) => recipe.id),
        mainDishId,
      );
      const name = dish?.name ?? "Dish";
      return { dishId, mainDishId, name, recipes, written: found.length > 0 };
    },
  );
  const written = rows.filter((row) => row.written);

  return (
    <section
      className="space-y-3 border-t border-line pt-4"
      aria-label="Food packaging"
      data-testid="pack-food-packaging"
    >
      <h2 className="text-lg font-semibold text-ink">
        Food packaging{serviceStyleName ? ` · ${serviceStyleName}` : ""}
      </h2>
      {!serviceStyleId ? (
        <p className="text-base text-ink-3">
          This event has no service style yet, so there is no packaging line to
          show. Set the service style on the event.
        </p>
      ) : written.length === 0 ? (
        <p className="text-base text-ink-3">
          No packaging written for {serviceStyleName ?? "this service style"} on
          this menu's dishes or recipes.
        </p>
      ) : (
        <ul className="m-0 list-none space-y-3 p-0">
          {written.map((row) => (
            <li key={row.dishId} className="space-y-1">
              <p className="text-base font-medium text-ink">{row.name}</p>
              <EventDishPackaging
                packaging={packaging}
                serviceStyleId={serviceStyleId}
                dishId={row.dishId}
                mainDishId={row.mainDishId}
                recipes={row.recipes}
              />
            </li>
          ))}
        </ul>
      )}
      {serviceStyleId && written.length < rows.length ? (
        <p className="text-sm text-ink-3">
          {rows.length - written.length} of {rows.length} dishes have no
          packaging written for this service style.
        </p>
      ) : null}
    </section>
  );
}
