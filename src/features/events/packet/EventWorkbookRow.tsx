import { Link } from "react-router-dom";
import type { PacketWorkbookSummary } from "../../../lib/eventPacket/summaryProjection";
import { StatusChip } from "../../../ui/primitives";
import { eventDetailPath } from "../eventRoutes";

function dateLabel(startsAt: number | null): string {
  if (startsAt == null) return "Date to confirm";
  return new Date(startsAt).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function timeLabel(startsAt: number | null): string {
  if (startsAt == null) return "";
  return new Date(startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function revisionLabel(
  revision: PacketWorkbookSummary["latestRevision"],
): string {
  if (!revision) return "Not printed";
  return `${revision.stage} · ${new Date(revision.createdAt).toLocaleDateString()}`;
}

/** One ledger row per event with packet evidence: what state the workbook is in. */
export function EventWorkbookRow({ row }: { row: PacketWorkbookSummary }) {
  const openTotal = row.openBlocking + row.openWarning;
  return (
    <div className="border-b border-line py-4">
      <div className="grid grid-cols-[150px_minmax(0,1fr)_150px_130px_140px] items-center gap-x-5 max-md:grid-cols-1 max-md:gap-y-1.5">
        <div className="font-mono text-base font-semibold text-ink">
          {dateLabel(row.startsAt)}
          {row.startsAt != null ? (
            <div className="text-sm font-medium text-ink-2">
              {timeLabel(row.startsAt)}
            </div>
          ) : null}
        </div>
        <div className="min-w-0">
          <Link
            to={eventDetailPath(row.eventId, "overview")}
            className="font-display block truncate text-xl text-ink hover:underline"
          >
            {row.title}
          </Link>
          <div className="truncate text-sm text-ink-2">{row.clientName}</div>
        </div>
        <div className="max-md:hidden">
          <StatusChip status={row.stage} />
        </div>
        <div className="flex items-center gap-3 max-md:mt-1">
          <span
            className={`chip ${
              row.ready
                ? "border-ok/30 bg-ok-soft text-ok"
                : "border-warn/30 bg-warn-soft text-warn"
            }`}
          >
            {row.ready
              ? "Ready"
              : `Needs attention${openTotal > 0 ? ` · ${openTotal} open` : ""}`}
          </span>
        </div>
        <div className="text-right text-base text-ink-2 max-md:hidden">
          <span className="font-mono">{row.sourceCount}</span> sources
          <div className="text-sm">
            {row.openBlocking > 0 ? (
              <span className="font-semibold text-danger">
                {row.openBlocking} blocking
              </span>
            ) : null}
            {row.openBlocking > 0 && row.openWarning > 0 ? " · " : ""}
            {row.openWarning > 0 ? (
              <span className="text-warn">{row.openWarning} warning</span>
            ) : null}
            {openTotal === 0 ? (
              <span className="text-ink-3">No open issues</span>
            ) : null}
          </div>
          <div className="text-sm text-ink-3">
            {revisionLabel(row.latestRevision)}
          </div>
        </div>
      </div>
      {row.openIssues.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-semibold text-ink-2">
            {row.openIssues.length} open{" "}
            {row.openIssues.length === 1 ? "issue" : "issues"}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {row.openIssues.map((issue) => (
              <li
                key={issue.id}
                className="flex flex-wrap items-baseline gap-x-3 text-sm"
              >
                <span
                  className={`chip ${
                    issue.severity === "blocking"
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : "border-warn/30 bg-warn-soft text-warn"
                  }`}
                >
                  {issue.severity}
                </span>
                <span className="text-ink">{issue.message}</span>
                <span className="text-ink-3">
                  {issue.section} · {issue.owner}
                </span>
              </li>
            ))}
          </ul>
          <Link
            to={eventDetailPath(row.eventId, "overview")}
            className="text-sm text-brand underline underline-offset-4"
          >
            Review in event
          </Link>
        </details>
      ) : null}
    </div>
  );
}
