import { useSourceLinksByCapsuleId } from "../../lib/sourceProvenance";
import { Section } from "../../ui/primitives";
import { SourceLinkList } from "../events/SourceLinkList";

interface ImportedPackList {
  sourceEventId?: string;
  sourcePage?: string;
  extractedAt?: string;
  items?: Array<{ group?: string }>;
  extractionErrors?: string[];
}

function readImported(raw: string | null | undefined): ImportedPackList {
  try {
    const parsed = JSON.parse(raw ?? "{}") as ImportedPackList;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Group name → line count, in the order the old system listed them. */
export function packGroups(
  items: ImportedPackList["items"],
): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of items ?? []) {
    const group = item.group?.trim() || "No group";
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts];
}

/**
 * Where an imported pack list came from (AC-282): the old event id, the page
 * it was read from and when, its groups, and anything the reader could not
 * read. Renders nothing for a pack list made in Capsule.
 */
export function PackListSourcePanel({
  packListId,
}: {
  readonly packListId: string;
}) {
  const links = useSourceLinksByCapsuleId(packListId);
  if (!links || links.length === 0) return null;
  const imported = readImported(links[0]!.rawSourceData);
  const groups = packGroups(imported.items);
  const problems = imported.extractionErrors ?? [];
  return (
    <Section title="From the old system">
      <div className="space-y-3 p-3" data-testid="pack-list-source-panel">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-ink-3">Old event</dt>
            <dd className="text-ink-2">
              {imported.sourceEventId || "Not known"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Read from</dt>
            <dd className="break-all text-ink-2">
              {imported.sourcePage || "Not known"}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">Read on</dt>
            <dd className="text-ink-2">
              {imported.extractedAt || "Not known"}
            </dd>
          </div>
        </dl>
        {groups.length > 0 ? (
          <p className="text-sm text-ink-2">
            Groups:{" "}
            {groups.map(([group, count]) => `${group} (${count})`).join(", ")}
          </p>
        ) : null}
        {problems.length > 0 ? (
          <div className="text-sm">
            <p className="text-ink-3">Lines the import could not read</p>
            <ul className="list-disc pl-5 text-ink-2">
              {problems.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <SourceLinkList links={links} />
      </div>
    </Section>
  );
}
