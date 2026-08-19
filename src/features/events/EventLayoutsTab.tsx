import type { Id } from "../../lib/api";
import { EventBattleBoardLayoutsPanel } from "./EventBattleBoardLayoutsPanel";
import { EventTabIntro } from "./EventTabIntro";

type Props = {
  readonly eventId: Id<"events">;
};

/** Venue layout sections (Buffet, Bar, Seating…) for the event battle board. */
export function EventLayoutsTab({ eventId }: Props) {
  return (
    <section className="space-y-4" data-testid="event-layouts-tab">
      <EventTabIntro
        title="Layouts"
        description="Define venue areas for this event and write setup notes for each section. Areas take any name, so two Bars can be told apart (“Main Bar”, “Patio Bar”)."
      />
      <EventBattleBoardLayoutsPanel eventId={eventId} />
    </section>
  );
}
