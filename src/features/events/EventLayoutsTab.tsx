import type { Id } from "../../lib/api";
import { EventBattleBoardLayoutsPanel } from "./EventBattleBoardLayoutsPanel";
import { EventDaySheetPanel } from "./EventDaySheetPanel";
import { EventTabIntro } from "./EventTabIntro";

type Props = {
  readonly eventId: Id<"events">;
};

/** Venue layout sections + battle board day sheet (responsibilities, buffet). */
export function EventLayoutsTab({ eventId }: Props) {
  return (
    <section className="space-y-5" data-testid="event-layouts-tab">
      <EventTabIntro
        title="Layouts"
        description="Define venue areas for this event, write setup notes for each section, and set the battle board day sheet — responsibility badges and buffet plate order. Areas take any name, so two Bars can be told apart (“Main Bar”, “Patio Bar”)."
      />
      <EventBattleBoardLayoutsPanel eventId={eventId} />
      <EventDaySheetPanel eventId={eventId} />
    </section>
  );
}
