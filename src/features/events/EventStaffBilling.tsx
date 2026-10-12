import { useState } from "react";
import type { Id } from "../../lib/api";
import { useEventAssignmentRows } from "../../lib/eventScopedQueries";
import {
  useAddPriceListLine,
  useRevisePriceListLine,
} from "../../lib/eventPriceListQueries";
import { useProposalLineItems } from "../../lib/financeScopedQueries";
import { reportActionFail, reportActionOk } from "../../ui/action-result";

const HOUR = 3_600_000;
const BILLED = new Set([
  "assigned",
  "confirmed",
  "checked_in",
  "checked_out",
  "unassigned",
]);

/**
 * Staff billed to the client, the way TPP bills staff: each role at a client
 * rate per hour for its people and hours. The roster (and open shifts) give
 * the people and hours; staff type each role's rate, and each role becomes
 * one line on the price list.
 */
export function EventStaffBilling({
  eventId,
  proposalId,
  eventStartsAt,
  eventEndsAt,
}: {
  eventId: Id<"events">;
  proposalId: Id<"proposals">;
  eventStartsAt: number | null;
  eventEndsAt: number | null;
}) {
  const rows = useEventAssignmentRows(eventId);
  const addLine = useAddPriceListLine();
  const reviseLine = useRevisePriceListLine();
  const lines = useProposalLineItems(proposalId);
  const [open, setOpen] = useState(false);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const roles = new Map<string, { people: number; hours: number }>();
  for (const row of rows ?? []) {
    if (row.deletedAt != null || !BILLED.has(String(row.status))) continue;
    const start = Number(row.startsAt ?? eventStartsAt ?? 0);
    const end = Number(row.endsAt ?? eventEndsAt ?? 0);
    const hours = end > start ? Math.round(((end - start) / HOUR) * 4) / 4 : 0;
    const role = String(row.role || "Staff");
    const sum = roles.get(role) ?? { people: 0, hours: 0 };
    roles.set(role, { people: sum.people + 1, hours: sum.hours + hours });
  }

  // A role billed before keeps one line: billing again updates it.
  const billedLine = (role: string) =>
    (lines ?? []).find(
      (line) =>
        line.deletedAt == null &&
        line.proposalId === proposalId &&
        line.description.startsWith(`Staff: ${role} (`),
    );

  if (rows === undefined || lines === undefined) return null;
  if (!open)
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm mt-3"
        onClick={() => setOpen(true)}
      >
        Bill staff
      </button>
    );

  const add = async () => {
    setBusy(true);
    let added = 0;
    try {
      for (const [role, { people, hours }] of roles) {
        const rate = Number(rates[role]);
        if (!(rate > 0) || !(hours > 0)) continue;
        const line = {
          description: `Staff: ${role} (${people} × ${hours / people} hr)`,
          pricingBasis: "per_unit",
          unitPrice: rate,
          quantity: hours,
          unit: "hr",
        };
        const existing = billedLine(role);
        if (existing)
          await reviseLine({
            docId: existing._id,
            version: existing.version,
            ...line,
          });
        else await addLine({ proposalId, ...line });
        added++;
      }
      if (added) {
        reportActionOk(
          `Billed ${added} staff role${added === 1 ? "" : "s"} on the price list.`,
        );
        setOpen(false);
        setRates({});
      } else reportActionFail("Type a rate for at least one role with hours.");
    } catch (error) {
      reportActionFail(
        error instanceof Error
          ? error.message
              .replace(/^.*(ConvexError|Uncaught Error): /, "")
              .split("\n")[0]!
          : "Couldn't add the staff lines.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-sm border border-line bg-inset p-3">
      <p className="font-medium text-ink">Bill staff to the client</p>
      {roles.size === 0 ? (
        <p className="mt-1 text-sm text-ink-2">
          Nobody is on this event's crew yet. Add staff or open shifts on the
          People tab first.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-2">
            People and hours come from the crew and open shifts. Type the rate
            you charge the client for each role; leave a role empty to not bill
            it.
          </p>
          <ul className="mt-2 space-y-2">
            {[...roles].map(([role, { people, hours }]) => (
              <li
                key={role}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="min-w-48 text-ink">
                  {role}: {people} {people === 1 ? "person" : "people"}, {hours}{" "}
                  hr
                </span>
                <label className="flex items-center gap-1 text-ink-2">
                  $
                  <input
                    className="input w-24"
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`Client rate per hour for ${role}`}
                    placeholder="per hr"
                    value={rates[role] ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      setRates((current) => ({
                        ...current,
                        [role]: event.target.value,
                      }))
                    }
                  />
                  / hr
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex gap-2">
        {roles.size > 0 ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void add()}
          >
            {busy ? "Adding…" : "Add to price list"}
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
