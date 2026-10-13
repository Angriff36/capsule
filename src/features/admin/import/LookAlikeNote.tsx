import { Fragment } from "react";
import { Link } from "react-router-dom";

const RECORD_PAGES: Record<string, string> = {
  client: "/clients/",
  venue: "/facilities/venues/",
};

/**
 * Why an imported item waits, for example "Same name as Frank (k97…)". The
 * import stores the other record's id so the two can be told apart; on screen
 * that id becomes an "open" link to the record (or is left out when that kind
 * of record has no page).
 */
export function LookAlikeNote({
  note,
  capsuleEntity,
}: {
  note: string;
  capsuleEntity: string;
}) {
  const page = RECORD_PAGES[capsuleEntity];
  const parts = plainNote(note).split(/ \(([a-z0-9]{31,32})\)/);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 0 ? (
          <Fragment key={index}>{part}</Fragment>
        ) : page ? (
          <Fragment key={index}>
            {" ("}
            <Link to={`${page}${part}`} className="underline">
              open
            </Link>
            {")"}
          </Fragment>
        ) : null,
      )}
    </>
  );
}

/**
 * Older imports wrote programmer wording and a raw timestamp into the note:
 * show them in plain words and a local date.
 */
function plainNote(note: string): string {
  return note
    .replace(
      " — reconciliation reference (match via markMatched on a Capsule payment)",
      " — match it to a Capsule payment",
    )
    .replace(
      /recorded (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/g,
      (_, iso: string) => `recorded ${new Date(iso).toLocaleDateString()}`,
    );
}
