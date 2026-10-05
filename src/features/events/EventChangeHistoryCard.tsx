import { useRecordHistory } from "../../lib/useRecordHistory";
import { EventOverviewCard } from "./EventOverviewCard";
import {
  FOLLOW_UP_LABEL,
  changeLabel,
  followUpCounts,
  followUpOutOfDate,
  ranForLine,
  waitingLine,
  whenLine,
  whoLine,
  type HistoryChange,
  type HistoryFollowUp,
} from "./eventChangeHistory";

/**
 * PL-AUDIT (AC-636): for managers, who made this event, who changed it and
 * when, and what each automatic follow-up (prep, pack list, staffing...)
 * did: the change it ran for, what it kept because a person had already
 * changed it, and what still waits on a manager. Hidden for everyone else.
 */
export function EventChangeHistoryCard({
  eventId,
}: {
  readonly eventId: string;
}) {
  const history = useRecordHistory(eventId);
  if (history === null) return null;
  if (history === undefined) {
    return (
      <EventOverviewCard title="Change history" testId="event-change-history">
        <p role="status">Loading…</p>
      </EventOverviewCard>
    );
  }
  const waiting = history.followUps.reduce(
    (sum, followUp) => sum + followUp.waiting.length,
    0,
  );
  return (
    <EventOverviewCard
      title="Change history"
      testId="event-change-history"
      aside={
        waiting > 0 ? (
          <span className="chip chip-tone-warn">
            {waiting} waiting on a manager
          </span>
        ) : null
      }
    >
      {history.madeBy ? (
        <p className="mb-3 text-sm text-ink-2">
          Made by {whoLine(history.madeBy)} · {whenLine(history.madeBy.at)}
        </p>
      ) : (
        <p className="mb-3 text-sm text-ink-2">
          No changes saved for this event yet.
        </p>
      )}
      {history.followUps.length > 0 ? (
        <details className="mb-2" open={waiting > 0}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            What Capsule did on its own{" "}
            <span className="font-normal text-ink-2">
              ({history.followUps.length})
            </span>
          </summary>
          <ul className="mt-2 space-y-2 pl-3">
            {history.followUps.map((followUp) => (
              <FollowUpRow
                key={followUp.domain}
                followUp={followUp}
                changes={history.changes}
              />
            ))}
          </ul>
        </details>
      ) : null}
      {history.changes.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Every change{" "}
            <span className="font-normal text-ink-2">
              ({history.changes.length})
            </span>
          </summary>
          <ul className="mt-2 divide-y divide-line pl-3">
            {history.changes.map((change) => (
              <ChangeRow key={change.eventId} change={change} />
            ))}
          </ul>
        </details>
      ) : null}
    </EventOverviewCard>
  );
}

function ChangeRow({ change }: { readonly change: HistoryChange }) {
  return (
    <li className="py-1.5 text-sm">
      <span className="text-ink">{changeLabel(change.change)}</span>
      <span className="text-ink-2">
        {" · "}
        {whoLine(change)} · {whenLine(change.at)}
        {change.versionAfter != null
          ? ` · version ${change.versionAfter} after`
          : ""}
      </span>
      {change.historyMissing ? (
        <span className="chip chip-tone-warn ml-2">No “who did it” note</span>
      ) : null}
    </li>
  );
}

function FollowUpRow({
  followUp,
  changes,
}: {
  readonly followUp: HistoryFollowUp;
  readonly changes: readonly HistoryChange[];
}) {
  const label =
    FOLLOW_UP_LABEL[followUp.domain] ?? changeLabel(followUp.domain);
  return (
    <li className="text-sm" data-testid={`event-follow-up-${followUp.domain}`}>
      <p className="font-medium text-ink">
        {label}
        {followUp.finished ? null : (
          <span className="chip chip-tone-warn ml-2">Not finished</span>
        )}
        {followUpOutOfDate(followUp, changes) ? (
          <span className="chip chip-tone-mute ml-2">Event changed since</span>
        ) : null}
      </p>
      <div className="space-y-0.5 text-ink-2">
        <p>
          {ranForLine(followUp, changes)} {whenLine(followUp.at)}.
        </p>
        <p>{followUpCounts(followUp)}</p>
        {followUp.waiting.map((item) => (
          <p key={item.code} className="text-ink">
            {waitingLine(item)}
          </p>
        ))}
      </div>
    </li>
  );
}
