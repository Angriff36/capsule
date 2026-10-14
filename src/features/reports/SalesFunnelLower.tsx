import { Link } from "react-router-dom";
import { formatCount, formatDate, formatMoney } from "../../lib/format";
import { EosPanel } from "../eos/EosShared";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { percentText } from "./dashboardRecordSets";
import { groupWinLoss, isOpen, isWaiting } from "./mangia/salesFigures";
import { DAY_MS, lossReasons, type FunnelEvent } from "./salesFunnel";

/**
 * The lower half of the sales funnel: the open deals to close next, and the
 * last 90 days of losses and lead sources.
 */
export function SalesFunnelLower({
  recent,
  upcoming,
  personName,
  sourceName,
  loading,
}: {
  recent: readonly FunnelEvent[];
  upcoming: readonly FunnelEvent[];
  personName: (id: string) => string;
  sourceName: (e: FunnelEvent) => string;
  loading: boolean;
}) {
  const today = new Date().setHours(0, 0, 0, 0);
  const open = upcoming.filter(isOpen);
  const deals = [...open]
    .sort((a, b) => (b.quotedPrice ?? 0) - (a.quotedPrice ?? 0))
    .slice(0, 5);
  const soon = open
    .filter((e) => Number(e.startsAt ?? 0) < today + 14 * DAY_MS)
    .sort((a, b) => Number(a.startsAt ?? 0) - Number(b.startsAt ?? 0));
  const waiting = open.filter(isWaiting);
  const reasons = lossReasons(recent);
  const sources = groupWinLoss(recent, sourceName).sort(
    (a, b) => (b.winRate ?? 0) - (a.winRate ?? 0),
  );
  const best = sources.slice(0, 3);
  const weakest = sources.length > 3 ? sources.slice(-2).reverse() : [];

  return (
    <div className="funnel-lower">
      <EosPanel
        tone="traction"
        eyebrow="Next 60 days"
        title="Deals to close"
        lead="Open quotes for upcoming events, biggest first."
      >
        {loading ? (
          <TableSkeleton rows={4} />
        ) : deals.length === 0 ? (
          <p className="text-sm text-ink-3">
            No open quotes for the next 60 days.
          </p>
        ) : (
          <div className="supply-table-wrap">
            <table className="data-table table-even phone-cards">
              <thead>
                <tr>
                  <th className="col-wide">Event</th>
                  <th>Stage</th>
                  <th>Salesperson</th>
                  <th className="col-num">Value</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((e) => (
                  <tr key={e._id}>
                    <td>
                      <Link
                        className="font-semibold text-ink"
                        to={`/events/${e._id}`}
                      >
                        {e.title || "Untitled event"}
                      </Link>
                      <small>
                        {formatDate(e.startsAt)}
                        {e.expectedHeadcount
                          ? ` · ${formatCount(e.expectedHeadcount)} guests`
                          : ""}
                      </small>
                    </td>
                    <td data-label="Stage">
                      <StatusChip status={String(e.stage ?? "")} />
                    </td>
                    <td data-label="Salesperson">
                      {e.assignedToId
                        ? personName(String(e.assignedToId))
                        : "No salesperson"}
                    </td>
                    <td className="num" data-label="Value">
                      <strong>{formatMoney(e.quotedPrice ?? 0)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="funnel-cards mt-4">
          <EventList
            title={`Starts within 14 days, still open (${soon.length})`}
            rows={soon}
            empty="Nothing open is that close."
          />
          <EventList
            title={`Waiting for approval (${waiting.length})`}
            rows={waiting}
            empty="Nothing is waiting for approval."
          />
        </div>
      </EosPanel>

      <EosPanel
        tone="issues"
        eyebrow="Last 90 days"
        title="Why we lose, and where wins come from"
        lead="Lost events by the reason written when they were cancelled, and lead sources by win rate."
      >
        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
          <>
            <p className="funnel-heading">Loss reasons</p>
            {reasons.length === 0 ? (
              <p className="text-sm text-ink-3">
                No lost events in the last 90 days.
              </p>
            ) : (
              reasons.map((row) => (
                <div key={row.reason} className="funnel-reason">
                  <div className="funnel-card-row">
                    <span>{row.reason}</span>
                    <span className="font-mono">
                      {formatCount(row.count)} · {percentText(row.share, "–")}
                    </span>
                  </div>
                  <div className="funnel-meter" aria-hidden="true">
                    <i style={{ width: `${row.share ?? 0}%` }} />
                  </div>
                </div>
              ))
            )}
            <p className="funnel-heading">Lead sources</p>
            {best.length === 0 ? (
              <p className="text-sm text-ink-3">
                No won or lost events in the last 90 days.
              </p>
            ) : (
              <div className="funnel-cards">
                <SourceList title="Best win rate" rows={best} />
                {weakest.length ? (
                  <SourceList title="Weakest win rate" rows={weakest} />
                ) : null}
              </div>
            )}
          </>
        )}
      </EosPanel>
    </div>
  );
}

function EventList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: readonly FunnelEvent[];
  empty: string;
}) {
  return (
    <div className="funnel-card">
      <span className="text-sm font-semibold text-ink">{title}</span>
      {rows.length === 0 ? (
        <small>{empty}</small>
      ) : (
        <ul className="mt-1 grid gap-0.5 text-sm">
          {rows.slice(0, 4).map((e) => (
            <li key={e._id} className="truncate">
              <Link className="text-link" to={`/events/${e._id}`}>
                {e.title || "Untitled event"}
              </Link>{" "}
              <span className="text-ink-3">{formatDate(e.startsAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SourceList({
  title,
  rows,
}: {
  title: string;
  rows: readonly { label: string; winRate: number | null; decided: number }[];
}) {
  return (
    <div className="funnel-card">
      <span className="text-sm font-semibold text-ink">{title}</span>
      <ul className="mt-1 grid gap-0.5 text-sm text-ink-2">
        {rows.map((row) => (
          <li key={row.label} className="flex justify-between gap-2">
            <span className="truncate">{row.label}</span>
            <span className="font-mono">
              {percentText(row.winRate, "–")} of {formatCount(row.decided)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
