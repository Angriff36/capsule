import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";
import { Section } from "../../ui/primitives";
import { SourceLinkList } from "../events/SourceLinkList";

/**
 * Where an imported client came from: the old-system id, the original row as
 * imported, and the import itself (AC-271). Renders nothing for a client made
 * in Capsule or for a person without import access.
 */
export function ClientSourceProvenancePanel({
  clientId,
}: {
  readonly clientId: string;
}) {
  const links = useSourceLinksByCapsuleId(clientId);
  if (!links || links.length === 0) return null;
  return (
    <Section title="Imported from">
      <div className="p-3" data-testid="client-source-provenance-panel">
        <SourceLinkList links={links} />
      </div>
    </Section>
  );
}
