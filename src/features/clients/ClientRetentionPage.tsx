import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useClientOutreachTaskComplete,
  useClientOutreachTaskDismiss,
  useCreateClientOutreachTask,
  useListClient,
  useListClientOutreachTask,
  useListEvent,
} from "../../lib/manifest-convex-react";
import { formatCountNoun, formatDate } from "../../lib/format";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { ClientsWorkspaceNav } from "./ClientsWorkspaceNav";
import { CrmFailureBanner } from "./CrmFailureBanner";
import { useActionNotice } from "../../ui/action-result";

interface RetentionRow {
  clientId: string;
  priorYearEvents: number;
  lastPriorYearEventAt: number;
  rebooked: boolean;
  active: boolean;
}

/** Bookings that count toward retention: live, not cancelled, dated. */
function bookingYear(event: {
  deletedAt?: unknown;
  stage?: unknown;
  startsAt?: unknown;
}): number | null {
  if (event.deletedAt != null) return null;
  if (String(event.stage) === "cancelled") return null;
  const startsAt = Number(event.startsAt);
  if (!Number.isFinite(startsAt) || startsAt === 0) return null;
  return new Date(startsAt).getFullYear();
}

export function computeRetention(
  clients: ReadonlyArray<{
    _id: string;
    deletedAt?: unknown;
    registeredAt?: unknown;
    status?: unknown;
  }>,
  events: ReadonlyArray<{
    clientId?: unknown;
    deletedAt?: unknown;
    stage?: unknown;
    startsAt?: unknown;
  }>,
  currentYear: number,
): { rows: RetentionRow[]; rebookedCount: number; rateLabel: string } {
  const priorYear = currentYear - 1;
  const byClient = new Map<string, RetentionRow>();
  for (const client of clients) {
    if (client.deletedAt != null || client.registeredAt == null) continue;
    byClient.set(String(client._id), {
      clientId: String(client._id),
      priorYearEvents: 0,
      lastPriorYearEventAt: 0,
      rebooked: false,
      active: String(client.status) === "active",
    });
  }
  for (const event of events) {
    const row = byClient.get(String(event.clientId));
    if (!row) continue;
    const year = bookingYear(event);
    if (year === priorYear) {
      row.priorYearEvents += 1;
      row.lastPriorYearEventAt = Math.max(
        row.lastPriorYearEventAt,
        Number(event.startsAt),
      );
    } else if (year === currentYear) {
      row.rebooked = true;
    }
  }
  const rows = [...byClient.values()].filter((row) => row.priorYearEvents > 0);
  const rebookedCount = rows.filter((row) => row.rebooked).length;
  const rateLabel =
    rows.length === 0
      ? "—"
      : `${Math.round((rebookedCount / rows.length) * 100)}%`;
  return { rows, rebookedCount, rateLabel };
}

export function ClientRetentionPage() {
  const clients = useListClient();
  const events = useListEvent();
  const outreachTasks = useListClientOutreachTask();
  const openOutreachTask = useCreateClientOutreachTask();
  const completeOutreachTask = useClientOutreachTaskComplete();
  const dismissOutreachTask = useClientOutreachTaskDismiss();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();

  const loading =
    clients === undefined ||
    events === undefined ||
    outreachTasks === undefined;
  const currentYear = new Date().getFullYear();
  const priorYear = currentYear - 1;

  const { rows, rebookedCount, rateLabel } = computeRetention(
    clients ?? [],
    events ?? [],
    currentYear,
  );
  const churnCandidates = rows.filter((row) => !row.rebooked && row.active);
  const openTasks = (outreachTasks ?? []).filter(
    (task) => String(task.status) === "open",
  );
  const openTaskClientIds = new Set(
    openTasks.map((task) => String(task.clientId)),
  );
  const uncoveredCandidates = churnCandidates.filter(
    (row) => !openTaskClientIds.has(row.clientId),
  );

  const run = (work: () => Promise<void>) => {
    setFailure(null);
    setNotice(null);
    setBusy(true);
    void (async () => {
      try {
        await work();
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(false);
      }
    })();
  };

  const churnReason = (row: RetentionRow) =>
    `Active in ${priorYear} (${row.priorYearEvents} event${row.priorYearEvents === 1 ? "" : "s"}) with no ${currentYear} booking yet`;

  const openForCandidate = (row: RetentionRow) =>
    run(async () => {
      await openOutreachTask({
        clientId: row.clientId,
        reason: churnReason(row),
      });
      setNotice("Outreach task opened.");
    });

  const openForAll = () =>
    run(async () => {
      for (const row of uncoveredCandidates) {
        await openOutreachTask({
          clientId: row.clientId,
          reason: churnReason(row),
        });
      }
      setNotice(
        `Opened ${uncoveredCandidates.length} outreach task${uncoveredCandidates.length === 1 ? "" : "s"}.`,
      );
    });

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Clients · Retention</p>
          <h1 className="display-title mt-2">Client retention</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Who came back this year — and who hasn't yet. For clients who booked
            in {priorYear} but not {currentYear}, open a follow-up task so
            someone reaches out before they book elsewhere.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || loading || uncoveredCandidates.length === 0}
            onClick={openForAll}
          >
            {busy
              ? "Working…"
              : `Open outreach tasks (${uncoveredCandidates.length})`}
          </button>
        </div>
      </header>
      <ClientsWorkspaceNav />
      {failure ? <CrmFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">
              {priorYear} → {currentYear}
            </p>
            <h2>Repeat booking rate</h2>
          </div>
          <span data-testid="repeat-booking-rate">
            {loading
              ? "…"
              : `${rateLabel} · ${rebookedCount} of ${rows.length} ${priorYear} clients rebooked`}
          </span>
        </div>
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Worth a call</p>
            <h2>No {currentYear} booking yet</h2>
          </div>
          <span>
            {loading ? "…" : formatCountNoun(churnCandidates.length, "client")}
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : churnCandidates.length === 0 ? (
          <div className="document-empty">
            <p>No one to chase.</p>
            <span>
              Every {priorYear} client either rebooked for {currentYear} or is
              archived.
            </span>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>{priorYear} events</th>
                <th>Last {priorYear} event</th>
                <th>Outreach</th>
              </tr>
            </thead>
            <tbody>
              {churnCandidates.map((row) => (
                <tr key={row.clientId}>
                  <td>
                    <Link
                      className="text-link"
                      to={CLIENTS_ROUTES.detail(row.clientId)}
                    >
                      {clientDisplayName(row.clientId, clients ?? [])}
                    </Link>
                  </td>
                  <td>{row.priorYearEvents}</td>
                  <td>
                    {row.lastPriorYearEventAt
                      ? formatDate(row.lastPriorYearEventAt)
                      : "—"}
                  </td>
                  <td>
                    {openTaskClientIds.has(row.clientId) ? (
                      <StatusChip status="open" />
                    ) : (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() => openForCandidate(row)}
                      >
                        Open outreach task
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Outreach</p>
            <h2>Open outreach tasks</h2>
          </div>
          <span>{loading ? "…" : `${openTasks.length} open`}</span>
        </div>
        {loading ? (
          <TableSkeleton rows={3} />
        ) : openTasks.length === 0 ? (
          <div className="document-empty">
            <p>No open outreach tasks.</p>
            <span>Open one from the list above.</span>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reason</th>
                <th>Opened</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {openTasks.map((task) => (
                <tr key={task._id}>
                  <td>
                    <Link
                      className="text-link"
                      to={CLIENTS_ROUTES.detail(String(task.clientId))}
                    >
                      {clientDisplayName(String(task.clientId), clients ?? [])}
                    </Link>
                  </td>
                  <td>{String(task.reason)}</td>
                  <td>{formatDate(task.openedAt)}</td>
                  <td>
                    <div className="supply-row-actions">
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await completeOutreachTask({
                              docId: task._id,
                              version: task.version,
                            });
                            setNotice("Outreach task completed.");
                          })
                        }
                      >
                        Complete
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await dismissOutreachTask({
                              docId: task._id,
                              version: task.version,
                            });
                            setNotice("Outreach task dismissed.");
                          })
                        }
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
