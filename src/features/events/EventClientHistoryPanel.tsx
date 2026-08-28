import { Link } from "react-router-dom";
import type { Doc } from "../../lib/api";
import { formatCount, formatDate, formatMoney } from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import { eventDetailPath } from "./eventRoutes";

type Props = {
  events: Doc<"events">[];
  currentEventId: string;
};

/**
 * Every governed event this client holds, newest last. Amounts are the
 * quoted price already on the Event — no revenue is inferred and no
 * invoice total is invented.
 */
export function EventClientHistoryPanel({ events, currentEventId }: Props) {
  if (events.length === 0) return null;
  return (
    <section className="card overflow-hidden">
      <div className="section-rule px-4 pt-4">
        <span>Event history</span>
        <i />
        <em>{formatCount(events.length)} events</em>
      </div>
      <table className="mt-3 w-full">
        <thead>
          <tr>
            <th className="th">Date</th>
            <th className="th">Event</th>
            <th className="th">Headcount</th>
            <th className="th">Quoted</th>
            <th className="th">Stage</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event._id}>
              <td className="td font-mono text-sm text-ink-2">
                {formatDate(event.startsAt)}
              </td>
              <td className="td">
                {event._id === currentEventId ? (
                  <span className="font-medium text-ink">
                    {event.title}
                    <span className="ml-2 text-sm text-ink-3">this event</span>
                  </span>
                ) : (
                  <Link className="link" to={eventDetailPath(event._id)}>
                    {event.title}
                  </Link>
                )}
              </td>
              <td className="td font-mono text-sm text-ink">
                {formatCount(Number(event.expectedHeadcount))}
              </td>
              <td className="td font-mono text-sm text-ink">
                {Number(event.quotedPrice) > 0
                  ? formatMoney(Number(event.quotedPrice))
                  : "—"}
              </td>
              <td className="td">
                <StatusChip status={String(event.stage)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
