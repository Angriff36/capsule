import type { Doc } from "../../../lib/api";
import { normalizeCurrencyCode } from "../../../lib/format";
import { useListOrganization } from "../../../lib/manifest-convex-react";
import {
  MobileClientCard,
  MobileMoneyCard,
  MobileNotesCard,
} from "./MobileEventInfoCards";
import {
  MobileFactsCard,
  MobileMenuCard,
  MobileStaffCard,
  MobileTimelineCard,
} from "./MobileEventReadCards";
import { MobilePackListCard } from "./MobilePackListCard";
import { MobilePrepCard } from "./MobilePrepCard";

type Props = {
  readonly event: Doc<"events">;
  readonly venue: { name: string } | null | undefined;
  readonly clients: readonly ({ _id: string } | null | undefined)[] | undefined;
  readonly dishes: readonly Doc<"dishes">[] | undefined;
  readonly eventDishes: readonly Doc<"eventDishes">[] | undefined;
  readonly activities: readonly Doc<"eventTimelineActivities">[] | undefined;
  readonly assignments: readonly Doc<"eventAssignments">[] | undefined;
  readonly people: readonly Doc<"people">[] | undefined;
};

/**
 * Phone event overview: one scrolling page of nine section cards, each with
 * "See all" into the existing full tab. Replaces the Overview tab below 768px.
 */
export function MobileEventOverview({
  event,
  venue,
  clients,
  dishes,
  eventDishes,
  activities,
  assignments,
  people,
}: Props) {
  const organizations = useListOrganization();
  // Same functional currency rule as FinanceOverviewPage; one value for the page.
  const currencyCode = normalizeCurrencyCode(
    organizations?.find((row) => row.deletedAt == null)?.defaultCurrencyCode,
    "USD",
  );
  return (
    <div className="space-y-3" data-testid="mobile-event-overview">
      <MobileFactsCard
        event={event}
        venue={venue}
        clients={clients}
        currencyCode={currencyCode}
      />
      <MobileMenuCard
        eventId={event._id}
        eventDishes={eventDishes}
        dishes={dishes}
      />
      <MobileTimelineCard
        eventId={event._id}
        activities={activities}
        people={people}
      />
      <MobileStaffCard
        eventId={event._id}
        assignments={assignments}
        people={people}
      />
      <MobilePrepCard eventId={event._id} />
      <MobilePackListCard eventId={event._id} />
      <MobileClientCard event={event} clients={clients} />
      <MobileNotesCard event={event} />
      <MobileMoneyCard event={event} currencyCode={currencyCode} />
    </div>
  );
}
