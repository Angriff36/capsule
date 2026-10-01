// PL-SOURCE-RESOLUTION (AC-059, AC-065): what a person decided on the import
// match list, read the same way by the match page and by every later import.

/** Link fields a person's decision leaves behind. */
type DecidedLink = {
  capsuleId?: string | null;
  conflictStatus: string;
  resolvedByUserId?: string | null;
};

/**
 * A person chose to leave this old-system row out: the item is closed by a
 * person and has no Capsule record. Later imports of the same row skip it
 * instead of making the record again.
 */
export function skippedByPerson(link: DecidedLink): boolean {
  return (
    !link.capsuleId &&
    link.conflictStatus === "resolved" &&
    link.resolvedByUserId != null
  );
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/** A readable name for a Capsule record an import item points at. */
export function recordLabel(row: Record<string, unknown>): string {
  const person = [text(row.givenName), text(row.familyName)]
    .filter(Boolean)
    .join(" ");
  return (
    (row.clientType === "company" ? text(row.companyName) : "") ||
    person ||
    text(row.companyName) ||
    text(row.name) ||
    text(row.title) ||
    "No name"
  );
}
