import { useState } from "react";
import { useAllRowsOnRequest } from "../../lib/financeScopedQueries";
import { formatDate, formatMoneyExact } from "../../lib/format";
import {
  COLD_AFTER_DAYS,
  REPLY_GOAL_HOURS,
  REPLY_WINDOW_DAYS,
  lostDeals,
  priceObjections,
  replyTimes,
  type HabitLead,
  type HabitProposal,
} from "../../lib/salesHabits";
import { StatCard } from "../../ui/charts/StatCard";
import { TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";

function hoursText(hours: number | undefined): string {
  if (hours === undefined) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours * 10) / 10} h`;
  return `${Math.round(hours / 24)} days`;
}

function share(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

/**
 * The sales habits the owner's sales audits track: first answer to a new
 * inquiry, "too expensive" answers, and the lost deal log. Every lead and
 * proposal is read only when someone opens it.
 */
export function SalesHabits({
  clients,
  onOpen,
}: {
  clients: Parameters<typeof clientDisplayName>[1];
  onOpen: (proposalId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const leads = useAllRowsOnRequest("leads", open) as HabitLead[] | undefined;
  const proposals = useAllRowsOnRequest("proposals", open) as
    HabitProposal[] | undefined;
  const now = Date.now();
  const reply = leads ? replyTimes(leads, now) : undefined;
  const pricey = proposals ? priceObjections(proposals, now) : undefined;
  const lost = proposals ? lostDeals(proposals, now) : undefined;
  const lostValue = lost?.reduce((sum, row) => sum + row.value, 0) ?? 0;

  return (
    <section className="working-ledger" aria-labelledby="sales-habits">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">How we sell</p>
          <h2 id="sales-habits">Sales habits</h2>
        </div>
        <button
          className="btn btn-ghost"
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show reply times and lost deals"}
        </button>
      </div>
      {!open ? null : reply === undefined ||
        pricey === undefined ||
        lost === undefined ? (
        <TableSkeleton rows={3} />
      ) : (
        <>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <StatCard
              title="First answer to a new inquiry"
              main={{ value: hoursText(reply.medianHours) }}
              rows={[
                {
                  label: `Answered within ${REPLY_GOAL_HOURS} h (goal)`,
                  value: `${share(reply.withinGoal, reply.replied)} of ${reply.replied}`,
                },
                {
                  label: "Still waiting for an answer",
                  value: reply.waiting,
                  format: "number",
                },
              ]}
              tone={
                reply.medianHours !== undefined &&
                reply.medianHours > REPLY_GOAL_HOURS
                  ? "warn"
                  : "ok"
              }
              size="compact"
            />
            <StatCard
              title='Proposals answered "too expensive"'
              main={{ value: share(pricey.objected, pricey.sent) }}
              rows={[
                {
                  label: "Said too expensive",
                  value: pricey.objected,
                  format: "number",
                },
                {
                  label: "Sent in the last 12 months",
                  value: pricey.sent,
                  format: "number",
                },
              ]}
              tone="info"
              size="compact"
            />
            <StatCard
              title="Lost deals, last 12 months"
              main={{ value: lostValue, format: "currency" }}
              rows={[
                {
                  label: "Proposals lost",
                  value: lost.length,
                  format: "number",
                },
                {
                  label: `No answer for ${COLD_AFTER_DAYS}+ days`,
                  value: lost.filter((row) => row.cold).length,
                  format: "number",
                },
              ]}
              tone="warn"
              size="compact"
            />
          </div>
          <p className="px-4 text-sm text-ink-3">
            Answer times count inquiries from the last {REPLY_WINDOW_DAYS} days
            where someone pressed Mark replied on the lead. Mark a proposal
            "Said too expensive" from its follow-up row.
          </p>
          <h3 className="px-4 pt-4 text-base font-semibold">Lost deal log</h3>
          {lost.length === 0 ? (
            <p className="p-4 text-base text-ink-2">
              No proposal lost in the last 12 months.
            </p>
          ) : (
            <table className="data-table phone-cards">
              <thead>
                <tr>
                  <th>Proposal</th>
                  <th>Value</th>
                  <th>Last touch</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {lost.map((row) => (
                  <tr key={row.proposalId}>
                    <td>
                      <button
                        className="text-link text-left"
                        type="button"
                        onClick={() => onOpen(row.proposalId)}
                      >
                        {row.title || "Untitled proposal"}
                      </button>
                      <p className="text-xs text-ink-3">
                        {clientDisplayName(row.clientId, clients)}
                      </p>
                    </td>
                    <td data-label="Value">{formatMoneyExact(row.value)}</td>
                    <td data-label="Last touch">{formatDate(row.lastTouch)}</td>
                    <td data-label="Why">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
