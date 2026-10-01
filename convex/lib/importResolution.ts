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

/** Old-system rows a person can match to a record, by link recordType. */
export const CHOOSABLE_RECORD_TYPES = new Set([
  "contact",
  "company",
  "venue",
  "event",
  "lead",
  "menu",
  "pack_list",
]);

/** Old-system rows Capsule can add a new record from. */
export const ADDABLE_RECORD_TYPES = new Set(["contact", "company", "venue"]);

/** The old-system row in a few words: its name and one or two details. */
export function sourceSummary(raw: string | null | undefined): {
  name: string;
  detail: string;
} {
  let row: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw ?? "{}") as unknown;
    if (parsed && typeof parsed === "object") {
      row = parsed as Record<string, unknown>;
    }
  } catch {
    // An unreadable row shows no summary.
  }
  const company = row.company as { name?: unknown } | undefined;
  const name =
    text(company?.name) ||
    [text(row.givenName), text(row.familyName)].filter(Boolean).join(" ") ||
    text(row.name) ||
    text(row.title) ||
    text(row.opportunityName);
  const detail = [
    text(row.email),
    [text(row.addressLine1), text(row.city)].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  return { name, detail };
}

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
