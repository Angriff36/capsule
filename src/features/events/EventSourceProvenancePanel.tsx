import { EventTabPanel } from "./EventTabPanel";
import type { Id } from "../../lib/api";
import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";
import { SourceLinkList, oldSystemStatus } from "./SourceLinkList";
import { OldSystemStatusAction } from "./OldSystemStatusAction";

/**
 * Shows the external-system provenance of the event on the Overview tab —
 * where the record was imported from (TPP/QuickBooks/etc.), its external id,
 * the import-run link, and the raw source payload captured for §6.1
 * reconciliation. Renders only when an import link exists, so a
 * natively-created event shows no empty section. When the old system says
 * the event is over or cancelled, it offers to copy that status.
 */
export function EventSourceProvenancePanel({
  capsuleId,
  stage,
  endsAt,
}: {
  readonly capsuleId: Id<"events"> | undefined | null;
  readonly stage?: string;
  readonly endsAt?: number | null;
}) {
  const links = useSourceLinksByCapsuleId(capsuleId);
  // Loading (undefined) or no provenance → render nothing.
  if (!links || links.length === 0) return null;
  const oldStatus = links
    .map((link) => oldSystemStatus(link.rawSourceData))
    .find((status) => status !== null);

  return (
    <EventTabPanel
      eyebrow="Source"
      title="Imported from"
      description="This event was brought in from another system. Here's where it came from and how it was matched up."
      testId="event-source-provenance-panel"
    >
      <SourceLinkList links={links} />
      {capsuleId && stage && oldStatus ? (
        <OldSystemStatusAction
          eventId={capsuleId}
          stage={stage}
          endsAt={endsAt}
          oldStatus={oldStatus}
        />
      ) : null}
    </EventTabPanel>
  );
}
