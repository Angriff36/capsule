import { formatCountNoun } from "../../lib/format";
import { formatWindow, type RosterConflict } from "./rosterConflicts";

export type OpenStaffNeed = {
  id: string;
  eventTitle: string;
  role: string;
  startsAt: number | null;
  endsAt: number | null;
  claimedBy: string | null;
};

/**
 * PR09-03: what the roster still needs - staffing not yet covered, and
 * clashes (double bookings, time off on booked work, a needed certificate
 * running out). Shown, never blocking.
 */
export function RosterAttentionSection({
  openNeeds,
  conflicts,
}: {
  openNeeds: readonly OpenStaffNeed[];
  conflicts: readonly RosterConflict[];
}) {
  if (openNeeds.length === 0 && conflicts.length === 0) return null;
  return (
    <section className="working-ledger" aria-label="Needs attention">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Needs attention</p>
          <h2>Still to cover and clashes</h2>
        </div>
      </div>
      {openNeeds.length > 0 ? (
        <div className="px-4 py-3">
          <p className="font-medium">
            {formatCountNoun(openNeeds.length, "spot")} still to cover
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {openNeeds.map((need) => (
              <li key={need.id}>
                <strong>{need.eventTitle}</strong> · {need.role}
                {need.startsAt != null && need.endsAt != null
                  ? ` · ${formatWindow(need.startsAt, need.endsAt)}`
                  : " · time not set yet"}
                {need.claimedBy
                  ? ` · ${need.claimedBy} offered to take it`
                  : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {conflicts.length > 0 ? (
        <div className="px-4 py-3">
          <p className="font-medium">
            {formatCountNoun(conflicts.length, "clash", "clashes")}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {conflicts.map((conflict) => (
              <li key={conflict.id}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
