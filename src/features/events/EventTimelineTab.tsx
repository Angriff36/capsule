import type { Id } from "../../lib/api";
import { EventTabIntro } from "./EventTabIntro";
import { EventTabPanel } from "./EventTabPanel";
import { EventTimelinePanel } from "./EventTimelinePanel";

type Props = {
  readonly eventId: Id<"events">;
  readonly startsAt?: number | null;
};

/** Day-of run sheet: templates and timeline blocks with assignees and questions. */
export function EventTimelineTab({ eventId, startsAt }: Props) {
  return (
    <section className="space-y-4" data-testid="event-timeline-tab">
      <EventTabIntro
        title="Timeline"
        description="Build the day-of run sheet from templates or custom blocks, then set times, owners, and block questions."
      />

      <EventTabPanel
        eyebrow="Run-of-show"
        title="Event timeline"
        description="Drag blocks to reorder (times follow). Assign Everyone, FOH, BOH, or event staff. Open Questions on a block for crew notes."
        testId="event-timeline-blocks"
      >
        <EventTimelinePanel eventId={eventId} defaultStartsAt={startsAt} />
      </EventTabPanel>
    </section>
  );
}
