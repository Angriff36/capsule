import { type Id } from "../../lib/api";
import { useEventReadiness } from "../../lib/useEventReadiness";
import { EventOverviewCard } from "./EventOverviewCard";
import {
  eventReadinessIssueLine,
  eventReadinessOpenCount,
  eventReadinessRows,
} from "./eventReadinessSummary";

/**
 * The live nine-domain readiness projection on the overview rail. Readiness is
 * a query result, never a stored Event name — every remount prints the current
 * facts. Display only: no resolve/override actions live here.
 */
export function EventReadinessCard({
  eventId,
}: {
  readonly eventId: Id<"events">;
}) {
  const projection = useEventReadiness(eventId);
  if (projection === undefined) {
    return (
      <EventOverviewCard title="Readiness" testId="event-readiness-summary">
        <p role="status">Loading readiness…</p>
      </EventOverviewCard>
    );
  }
  if (projection === null) return null;
  const openCount = eventReadinessOpenCount(projection);
  return (
    <EventOverviewCard
      title="Readiness"
      testId="event-readiness-summary"
      aside={
        <span className="text-base font-semibold text-ink-2">
          {openCount} open
        </span>
      }
    >
      <ul>
        {eventReadinessRows(projection).map((row) => (
          <DomainRow key={row.domain} row={row} />
        ))}
      </ul>
    </EventOverviewCard>
  );
}

function DomainRow({
  row,
}: {
  readonly row: ReturnType<typeof eventReadinessRows>[number];
}) {
  return (
    <li data-testid={`event-readiness-domain-${row.domain}`}>
      <div className="event-rail-row">
        <span className="event-rail-label text-ink">{row.label}</span>
        <span className="event-rail-value text-ink-2">
          {row.issues.length > 0 ? row.issues.length : "Clear"}
        </span>
      </div>
      {row.issues.map((issue) => (
        <p
          key={`${issue.code}:${issue.affectedIds.join(",")}`}
          className="text-sm text-ink-2"
        >
          {eventReadinessIssueLine(issue)}
        </p>
      ))}
    </li>
  );
}
