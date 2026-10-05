import {
  useMergedClients,
  useSourceLinksByCapsuleId,
} from "../../lib/sourceProvenance";
import { Section } from "../../ui/primitives";
import { SourceLinkList } from "../events/SourceLinkList";

/**
 * Where an imported client came from: the old-system id, the original row as
 * imported, and the import itself (AC-271). After a merge it also lists the
 * earlier names and keeps the old-system links of the merged clients
 * (AC-181). Renders nothing for a client made in Capsule or for a person
 * without import access.
 */
export function ClientSourceProvenancePanel({
  clientId,
}: {
  readonly clientId: string;
}) {
  const links = useSourceLinksByCapsuleId(clientId);
  const merged = useMergedClients(clientId);
  const hasLinks = !!links && links.length > 0;
  const hasMerged = !!merged && merged.length > 0;
  if (!hasLinks && !hasMerged) return null;
  return (
    <Section title="Imported from">
      <div
        className="space-y-3 p-3"
        data-testid="client-source-provenance-panel"
      >
        {hasMerged ? (
          <div data-testid="client-earlier-names">
            <p className="text-sm text-ink-3">Earlier names (merged in)</p>
            <ul className="mt-1 text-sm text-ink-2">
              {merged.map((row) => (
                <li key={row.clientId}>{row.name}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {hasLinks ? <SourceLinkList links={links} /> : null}
      </div>
    </Section>
  );
}
