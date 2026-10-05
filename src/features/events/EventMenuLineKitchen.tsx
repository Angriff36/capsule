import { Link } from "react-router-dom";
import {
  canReadCulinaryDemand,
  useEventDemandReview,
} from "../../lib/culinaryDemandClient";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { readableRecipeAmount } from "../../lib/recipeDisplay";
import { componentPath } from "../kitchen/kitchenRoutes";

/**
 * Kitchen facts for one event menu line (BE-9.5): whether its servings follow
 * the guest count, which recipe and edition it is made from with the amount
 * and batches needed, and how many notices the line still has. The notices
 * themselves are listed in the menu's "Unresolved materials" box.
 */
export function EventMenuLineKitchen({
  eventId,
  eventDishId,
  followsEventHeadcount,
}: {
  eventId: string;
  eventDishId: string;
  followsEventHeadcount: boolean | null | undefined;
}) {
  const role = useAuthStatus()?.role;
  const review = useEventDemandReview(eventId, canReadCulinaryDemand(role));
  const line = review?.eventDishes.find((d) => d.eventDishId === eventDishId);
  const follows =
    followsEventHeadcount === false
      ? "Set count — stays when the guest count changes"
      : "Follows the guest count";
  return (
    <div
      className="mt-1 space-y-0.5 text-sm text-ink-2"
      data-testid="event-menu-line-kitchen"
    >
      <p>{follows}</p>
      {(line?.recipeNeeds ?? []).map((need) => (
        <p key={need.sourceKey}>
          <Link
            to={componentPath(need.componentId)}
            className="underline decoration-dotted hover:text-ink"
          >
            {need.componentName}
          </Link>
          {need.editionVersion != null
            ? ` · edition ${need.editionVersion}`
            : ""}
          {" · "}
          {readableRecipeAmount(need.needQuantity, need.needUnit)}
          {need.batchesExact != null
            ? ` (${Number(need.batchesExact.toFixed(2))} ${
                need.batchesExact === 1 ? "batch" : "batches"
              })`
            : " (batches unknown)"}
        </p>
      ))}
      {line && line.unresolved.length > 0 ? (
        <p className="font-medium text-warn">
          {line.unresolved.length === 1
            ? "1 thing to settle"
            : `${line.unresolved.length} things to settle`}{" "}
          — see Unresolved materials.
        </p>
      ) : null}
    </div>
  );
}
