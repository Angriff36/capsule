import { Link } from "react-router-dom";
import { AlertTriangleIcon } from "../../ui/icons";
import type { GuestSummary } from "./eventGuestSummary";

type Props = {
  summary: GuestSummary;
  expectedHeadcount?: number | null;
  briefingPath: string;
};

function Tally({
  label,
  count,
  tone = "quiet",
}: {
  label: string;
  count: number;
  tone?: "ok" | "warn" | "quiet";
}) {
  const fill =
    tone === "ok"
      ? "bg-ok-soft text-ok"
      : tone === "warn"
        ? "bg-warn-soft text-warn"
        : "bg-inset text-ink-2";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-base text-ink-2">{label}</span>
      <span
        className={`inline-flex h-6 min-w-7 items-center justify-center rounded-full px-2 font-mono text-xs font-semibold ${fill}`}
      >
        {count}
      </span>
    </div>
  );
}

function Meter({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone: string;
}) {
  const width = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mt-1.5 h-1 rounded-full bg-inset">
      <div
        className={`h-1 rounded-full ${tone}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/**
 * Right-hand reading column for the Guests tab: RSVP position, what the
 * kitchen has to cook around, and the allergen briefing this list feeds.
 * Every number comes from the recorded guest list — no invented totals.
 */
export function EventGuestSidebar({
  summary,
  expectedHeadcount,
  briefingPath,
}: Props) {
  const headcount = Number(expectedHeadcount) || 0;
  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-64">
      <div className="card p-4">
        <p className="eyebrow">RSVP status</p>
        <div className="mt-3">
          <Tally label="Confirmed" count={summary.confirmed} tone="ok" />
          <Meter value={summary.confirmed} total={summary.total} tone="bg-ok" />
        </div>
        <div className="mt-3">
          <Tally label="Pending" count={summary.pending} tone="warn" />
          <Meter value={summary.pending} total={summary.total} tone="bg-warn" />
        </div>
        <div className="mt-3">
          <Tally label="Declined" count={summary.declined} />
          <Meter
            value={summary.declined}
            total={summary.total}
            tone="bg-ink-3"
          />
        </div>
        {headcount > 0 ? (
          <p className="mt-3 border-t border-line pt-2 text-sm text-ink-3">
            {summary.total} of {headcount} sold covers recorded.
          </p>
        ) : null}
      </div>

      <div className="card p-4">
        <p className="eyebrow">Dietary breakdown</p>
        <div className="mt-3 grid gap-2">
          {summary.dietary.length === 0 ? (
            <p className="text-sm text-ink-3">Nothing recorded yet.</p>
          ) : (
            summary.dietary.map((row) => (
              <Tally key={row.label} label={row.label} count={row.count} />
            ))
          )}
        </div>
      </div>

      {summary.allergens.length > 0 ? (
        <div className="rounded-md border border-warn/40 bg-warn-soft p-4">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon
              width={15}
              height={15}
              className="mt-0.5 shrink-0 text-warn"
            />
            <div className="min-w-0">
              <p className="text-base font-semibold text-warn">
                Allergen summary
              </p>
              <ul className="mt-1.5 grid gap-1 text-sm text-ink-2">
                {summary.allergens.map((row) => (
                  <li key={row.label}>
                    {row.label}: {row.count}{" "}
                    {row.count === 1 ? "guest" : "guests"}
                  </li>
                ))}
              </ul>
              <Link className="text-link mt-2 inline-flex" to={briefingPath}>
                View briefing page
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {summary.specialMeals > 0 ? (
        <div className="rounded-md border border-info/40 bg-info-soft p-4">
          <p className="text-base font-semibold text-info">Special meals</p>
          <p className="mt-1 text-sm text-ink-2">
            {summary.specialMeals}{" "}
            {summary.specialMeals === 1 ? "guest requires" : "guests require"} a
            separately prepared plate. Carry it into the kitchen brief.
          </p>
        </div>
      ) : null}

      {summary.unassignedTables > 0 ? (
        <div className="card p-4">
          <p className="eyebrow">Seating</p>
          <p className="mt-2 text-base text-ink-2">
            {summary.unassignedTables} of {summary.total} recorded guests have
            no table yet.
          </p>
        </div>
      ) : null}
    </aside>
  );
}
