import type { Id } from "../../lib/api";
import { EventTabIntro } from "./EventTabIntro";
import { EventTimelinePanel } from "./EventTimelinePanel";
import { EventTimingPlanner } from "./EventTimingPlanner";

type Props = {
  readonly eventId: Id<"events">;
  readonly startsAt?: number | null;
};

/** Day-of run sheet: templates and timeline blocks with assignees and questions. */
export function EventTimelineTab({ eventId }: Props) {
  return (
    <section className="space-y-5" data-testid="event-timeline-tab">
      <EventTabIntro
        title="Timeline"
        description="Build the day-of run sheet from templates or custom blocks. Leave times blank until known. Drag fully timed, uncompleted blocks to move their time slots; other reorders keep recorded times. Assign teams or event staff, and open Questions for crew notes."
      />
      <EventTimingPlanner eventId={eventId} />
      <div data-testid="event-timeline-blocks">
        <EventTimelinePanel eventId={eventId} />
      </div>
    </section>
  );
}
