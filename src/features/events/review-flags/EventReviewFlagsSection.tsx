import { useActionPrompt } from "../../../ui/action-prompt";
import { EventReviewFlagsPanel } from "./EventReviewFlagsPanel";
import { useEventReviewFlags } from "./useEventReviewFlags";

/**
 * Self-contained Overview block: loads the event's review flags and owns the
 * prompt host, so the Overview tab only has to drop it in.
 */
export function EventReviewFlagsSection({
  eventId,
  canSettle = true,
}: {
  eventId: string;
  canSettle?: boolean;
}) {
  const flags = useEventReviewFlags(eventId);
  const { prompt, host } = useActionPrompt();
  if (flags.loading) return null;
  return (
    <>
      {host}
      <EventReviewFlagsPanel
        flags={flags}
        prompt={prompt}
        canSettle={canSettle}
      />
    </>
  );
}
