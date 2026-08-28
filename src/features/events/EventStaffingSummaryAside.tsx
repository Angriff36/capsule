import { type ReactNode } from "react";
import type { EventStaffNeedRow } from "./EventStaffingCoverageView";
import type { StaffingRosterEntry } from "./eventTimelineStaffRoster";

export type StaffingConflictNote = {
  readonly key: string;
  readonly label: string;
  readonly role: string;
  readonly reasons: readonly string[];
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

function StatRow({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-base text-ink-3">{label}</span>
      <span className={`font-mono text-base font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}

/** Right-hand rail for the Staffing tab: counts, roles, and conflict flags. */
export function EventStaffingSummaryAside({
  roster,
  needs,
  conflicts,
}: {
  roster: readonly StaffingRosterEntry[];
  needs: readonly EventStaffNeedRow[];
  conflicts: readonly StaffingConflictNote[];
}) {
  const confirmed = roster.filter(
    (entry) =>
      entry.status === "confirmed" ||
      entry.status === "checked_in" ||
      entry.status === "checked_out",
  ).length;
  const open = needs.filter((need) => need.status === "open").length;
  const claimed = needs.filter((need) => need.status === "claimed").length;
  const filled = needs.filter((need) => need.status === "filled").length;

  const byRole = new Map<string, number>();
  for (const entry of roster) {
    const role = entry.role.trim() || "Unassigned role";
    byRole.set(role, (byRole.get(role) ?? 0) + 1);
  }
  const roles = [...byRole.entries()].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  );

  const posted = needs.filter((need) => need.status !== "cancelled").length;
  const coveredPct = posted === 0 ? 0 : Math.round((filled / posted) * 100);

  return (
    <div className="flex flex-col gap-3" data-testid="event-staffing-aside">
      <AsideCard title="Staffing summary">
        <div className="divide-y divide-line">
          <div className="pb-1">
            <StatRow label="On the roster" value={roster.length} />
            <StatRow
              label="Confirmed"
              value={confirmed}
              tone={confirmed > 0 ? "text-ok" : "text-ink-3"}
            />
          </div>
          <div className="pt-1">
            <StatRow
              label="Open shifts"
              value={open}
              tone={open > 0 ? "text-warn" : "text-ink-3"}
            />
            <StatRow
              label="Held for someone"
              value={claimed}
              tone={claimed > 0 ? "text-info" : "text-ink-3"}
            />
            <StatRow label="Filled" value={filled} tone="text-ink" />
          </div>
        </div>
      </AsideCard>

      {posted > 0 ? (
        <AsideCard title="Open-shift coverage">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-base text-ink-3">Filled</span>
            <span className="font-mono text-base font-semibold text-ink">
              {filled}/{posted}
            </span>
          </p>
          <span
            className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-ok"
              style={{ width: `${coveredPct}%` }}
            />
          </span>
          <p className="mt-1.5 font-mono text-xs text-ink-3">
            {coveredPct}% of posted shifts covered
          </p>
        </AsideCard>
      ) : null}

      {roles.length > 0 ? (
        <AsideCard title="By role">
          <ul className="flex flex-col gap-1.5">
            {roles.map(([role, count]) => (
              <li
                key={role}
                className="flex items-center justify-between gap-3 rounded-sm border border-line px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-base text-ink">
                  {role}
                </span>
                <span className="font-mono text-xs font-semibold text-ink-2">
                  {count}
                </span>
              </li>
            ))}
          </ul>
        </AsideCard>
      ) : null}

      {conflicts.length > 0 ? (
        <section className="rounded-md border border-warn/40 bg-warn-soft px-3.5 py-3">
          <h3 className="text-sm font-bold tracking-[0.06em] text-warn uppercase">
            Availability conflicts
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {conflicts.map((note) => (
              <li key={note.key} className="text-base text-ink-2">
                <span className="font-medium text-ink">{note.label}</span>
                {note.role ? (
                  <span className="text-ink-3"> · {note.role}</span>
                ) : null}
                <p className="text-sm text-warn">{note.reasons.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : roster.length > 0 ? (
        <section className="rounded-md border border-ok/40 bg-ok-soft px-3.5 py-3">
          <h3 className="text-sm font-bold tracking-[0.06em] text-ok uppercase">
            No conflicts
          </h3>
          <p className="mt-1 text-base text-ink-2">
            Nobody on this roster has an overlapping shift or approved time off
            in the event window.
          </p>
        </section>
      ) : null}
    </div>
  );
}
