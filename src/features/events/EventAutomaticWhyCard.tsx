import { type Id } from "../../lib/api";
import type { AutomaticExplanation } from "../../lib/automaticExplanation";
import { useEventAutomaticExplanations } from "../../lib/useEventAutomaticExplanations";
import { EventOverviewCard } from "./EventOverviewCard";
import {
  ORIGIN_LABEL,
  groupAutomaticWhy,
  lastUpdatedLine,
  sourceLine,
  type AutomaticWhyGroup,
} from "./eventAutomaticWhy";

/**
 * "Why is this here?" for everything Capsule filled in by itself on this
 * event: proposal lines, timeline steps, planning answers, crew needs, prep
 * tasks, ingredients to buy and pack lines. Each part opens to show why each
 * item exists, who changed it, if it is out of date and what holds it up.
 * Display only: the fix lives on the tab the item belongs to.
 */
export function EventAutomaticWhyCard({
  eventId,
}: {
  readonly eventId: Id<"events">;
}) {
  const result = useEventAutomaticExplanations(eventId);
  if (result === undefined) {
    return (
      <EventOverviewCard title="Why is this here?" testId="event-automatic-why">
        <p role="status">Loading…</p>
      </EventOverviewCard>
    );
  }
  if (result === null) return null;
  const groups = groupAutomaticWhy(result.items);
  const attention = groups.reduce((sum, group) => sum + group.attention, 0);
  return (
    <EventOverviewCard
      title="Why is this here?"
      testId="event-automatic-why"
      aside={
        attention > 0 ? (
          <span className="chip chip-tone-warn">{attention} need a look</span>
        ) : null
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-ink-2">
          Capsule has not filled in anything on this event yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <WhyGroup key={group.kind} group={group} />
          ))}
        </ul>
      )}
    </EventOverviewCard>
  );
}

function WhyGroup({ group }: { readonly group: AutomaticWhyGroup }) {
  return (
    <li data-testid={`event-automatic-why-${group.kind}`}>
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          {group.label}{" "}
          <span className="font-normal text-ink-2">({group.items.length})</span>
          {group.attention > 0 ? (
            <span className="chip chip-tone-warn ml-2">
              {group.attention} need a look
            </span>
          ) : null}
        </summary>
        <ul className="mt-2 space-y-1 pl-3">
          {group.items.map((item) => (
            <WhyItem key={`${item.kind}:${item.id}`} item={item} />
          ))}
        </ul>
      </details>
    </li>
  );
}

function WhyItem({ item }: { readonly item: AutomaticExplanation }) {
  return (
    <li>
      <details>
        <summary className="cursor-pointer text-sm text-ink">
          {item.label}
          {item.value ? (
            <span className="text-ink-2"> · {item.value}</span>
          ) : null}
          {item.blocking ? (
            <span className="chip chip-tone-danger ml-2">Held up</span>
          ) : item.stale ? (
            <span className="chip chip-tone-warn ml-2">Out of date</span>
          ) : null}
        </summary>
        <div className="mt-1 space-y-1 pl-3 text-sm text-ink-2">
          <p>{item.why}</p>
          <p>
            <span className="chip chip-tone-mute">
              {ORIGIN_LABEL[item.origin]}
            </span>
            {item.status ? (
              <span className="ml-2">Status: {item.status}</span>
            ) : null}
          </p>
          {item.stale && item.staleReason ? <p>{item.staleReason}</p> : null}
          {item.blocking ? (
            <p>
              <span className="font-semibold text-ink">Held up:</span>{" "}
              {item.blocking.reason} {item.blocking.action}
            </p>
          ) : null}
          <p>{sourceLine(item)}</p>
          <p>{lastUpdatedLine(item.lastReconciledAt)}</p>
        </div>
      </details>
    </li>
  );
}
