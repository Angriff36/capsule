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
  const parts = note.split(/ \(([a-z0-9]{31,32})\)/);
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
