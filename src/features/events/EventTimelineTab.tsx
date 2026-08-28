import type { Id } from "../../lib/api";
import { EventTabIntro } from "./EventTabIntro";
import { EventTimelinePanel } from "./EventTimelinePanel";

type Props = {
  readonly eventId: Id<"events">;
  readonly startsAt?: number | null;
};

/** Day-of run sheet: templates and timeline blocks with assignees and questions. */
export function EventTimelineTab({ eventId, startsAt }: Props) {
  return (
    <section className="space-y-5" data-testid="event-timeline-tab">
      <EventTabIntro
        title="Timeline"
        description="Build the day-of run sheet from templates or custom blocks. Drag blocks to reorder (times follow), assign Everyone, FOH, BOH, or event staff, and open Questions on a block for crew notes."
      />
      <div data-testid="event-timeline-blocks">
        <EventTimelinePanel eventId={eventId} defaultStartsAt={startsAt} />
      </div>
    </section>
  );
}
