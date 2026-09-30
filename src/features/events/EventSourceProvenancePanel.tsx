import { EventTabPanel } from "./EventTabPanel";
import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";
import { SourceLinkList } from "./SourceLinkList";

/**
 * Shows the external-system provenance of the event on the Overview tab —
 * where the record was imported from (TPP/QuickBooks/etc.), its external id,
 * the import-run link, and the raw source payload captured for §6.1
 * reconciliation. Read-only; renders only when an import link exists, so a
 * natively-created event shows no empty section.
 */
export function EventSourceProvenancePanel({
  capsuleId,
}: {
  readonly capsuleId: string | undefined | null;
}) {
  const links = useSourceLinksByCapsuleId(capsuleId);
  // Loading (undefined) or no provenance → render nothing.
  if (!links || links.length === 0) return null;

  return (
    <EventTabPanel
      eyebrow="Source"
      title="Imported from"
      description="This event was brought in from another system. Here's where it came from and how it was matched up."
      testId="event-source-provenance-panel"
    >
      <SourceLinkList links={links} />
    </EventTabPanel>
  );
}
