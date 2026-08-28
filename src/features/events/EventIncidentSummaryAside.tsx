import { type ReactNode } from "react";
import type { Doc } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"] as const;
const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-danger",
  high: "bg-danger",
  medium: "bg-warn",
  low: "bg-info",
};

function AsideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card px-3.5 py-3">
      <h3 className="mb-2.5 text-sm font-bold tracking-[0.06em] text-ink uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function CountRow({
  label,
  value,
  tone = "text-ink",
  dot,
}: {
  label: string;
  value: string | number;
  tone?: string;
  dot?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="flex items-center gap-2 text-base text-ink-3">
        {dot ? (
          <span
            className={`h-1.5 w-1.5 rounded-full ${dot}`}
            aria-hidden="true"
          />
        ) : null}
        {label}
      </span>
      <span className={`font-mono text-base font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}

/** Right-hand rail for the Incidents tab: counts, severity, category, log. */
export function EventIncidentSummaryAside({
  incidents,
  openCorrectiveCount,
}: {
  incidents: readonly Doc<"incidents">[];
  openCorrectiveCount: number;
}) {
  const resolved = incidents.filter((row) => row.status === "resolved").length;
  const dismissed = incidents.filter(
    (row) => row.status === "dismissed",
  ).length;
  const openCount = incidents.length - resolved - dismissed;
  const resolutionRate =
    incidents.length === 0
      ? null
      : Math.round((resolved / incidents.length) * 100);

  const bySeverity = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const row of incidents) {
    const severity = String(row.severity);
    const category = String(row.category);
    bySeverity.set(severity, (bySeverity.get(severity) ?? 0) + 1);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }
  const severities = SEVERITY_ORDER.filter((key) => bySeverity.has(key));
  const categories = [...byCategory.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );

  return (
    <div className="flex flex-col gap-3" data-testid="event-incident-aside">
      <AsideCard title="Incident summary">
        <div className="divide-y divide-line">
          <div className="pb-1">
            <CountRow label="Reported" value={incidents.length} />
            <CountRow
              label="Open"
              value={openCount}
              tone={openCount > 0 ? "text-warn" : "text-ink-3"}
            />
            <CountRow
              label="Resolved"
              value={resolved}
              tone={resolved > 0 ? "text-ok" : "text-ink-3"}
            />
            {dismissed > 0 ? (
              <CountRow label="Dismissed" value={dismissed} tone="text-ink-3" />
            ) : null}
          </div>
          {resolutionRate != null ? (
            <div className="pt-1">
              <CountRow
                label="Resolution rate"
                value={`${resolutionRate}%`}
                tone="text-ink"
              />
            </div>
          ) : null}
        </div>
      </AsideCard>

      {severities.length > 0 ? (
        <AsideCard title="By severity">
          {severities.map((severity) => (
            <CountRow
              key={severity}
              label={formatStatusLabel(severity)}
              value={bySeverity.get(severity) ?? 0}
              dot={SEVERITY_DOT[severity]}
            />
          ))}
        </AsideCard>
      ) : null}

      {categories.length > 0 ? (
        <AsideCard title="By category">
          {categories.map(([category, count]) => (
            <CountRow
              key={category}
              label={formatStatusLabel(category)}
              value={count}
            />
          ))}
        </AsideCard>
      ) : null}

      {openCorrectiveCount > 0 ? (
        <section className="rounded-md border border-warn/40 bg-warn-soft px-3.5 py-3">
          <h3 className="text-sm font-bold tracking-[0.06em] text-warn uppercase">
            Corrective action open
          </h3>
          <p className="mt-1 text-base text-ink-2">
            {openCorrectiveCount} incident
            {openCorrectiveCount === 1 ? " stays" : "s stay"} locked until the
            corrective action is closed.
          </p>
        </section>
      ) : incidents.length > 0 && openCount === 0 ? (
        <section className="rounded-md border border-ok/40 bg-ok-soft px-3.5 py-3">
          <h3 className="text-sm font-bold tracking-[0.06em] text-ok uppercase">
            All issues closed
          </h3>
          <p className="mt-1 text-base text-ink-2">
            Every reported incident on this event has been resolved or
            dismissed.
          </p>
        </section>
      ) : null}

      {incidents.length > 0 ? (
        <AsideCard title="Log">
          <ol className="flex flex-col gap-2">
            {incidents.slice(0, 6).map((row) => (
              <li key={row._id} className="flex gap-2.5">
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    SEVERITY_DOT[String(row.severity)] ?? "bg-line-2"
                  }`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-ink-2">
                    {formatDate(row.reportedAt)}
                  </span>
                  <span className="block truncate text-base text-ink-3">
                    {formatStatusLabel(String(row.category))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </AsideCard>
      ) : null}
    </div>
  );
}
