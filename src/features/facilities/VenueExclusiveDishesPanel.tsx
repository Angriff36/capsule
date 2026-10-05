import { Link } from "react-router-dom";
import { useDishesExclusiveToVenue } from "../../lib/useDishesByIds";
import { Section } from "../../ui/primitives";
import { dishPath } from "../kitchen/kitchenRoutes";
import { venueMenuCardPath } from "./facilitiesRoutes";

/**
 * Venue-exclusive menu items (Venue Partner Playbook section 07): the dishes
 * offered only at this venue. Set on the dish page ("Offered at").
 */
export function VenueExclusiveDishesPanel({ venueId }: { venueId: string }) {
  const dishes = useDishesExclusiveToVenue(venueId);
  return (
    <Section title="Dishes only at this venue">
      <div className="space-y-2 p-4 text-sm">
        {dishes === undefined ? (
          <p className="text-ink-3">Loading…</p>
        ) : dishes.length === 0 ? (
          <p className="text-ink-3">
            None yet. To add one, open a dish and set “Offered at” to this
            venue.
          </p>
        ) : (
          <ul className="space-y-1">
            {dishes.map((dish) => (
              <li key={dish._id}>
                <Link className="link" to={dishPath(dish._id)}>
                  {dish.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="btn btn-secondary" to={venueMenuCardPath(venueId)}>
          Venue menu card
        </Link>
      </div>
    </Section>
  );
}
