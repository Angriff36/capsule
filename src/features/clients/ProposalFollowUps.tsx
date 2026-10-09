import { useState } from "react";
import { useProposalRecordFollowUp } from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import {
  proposalFollowUps,
  type FollowUpProposal,
  type FollowUpRow,
} from "../../lib/proposalFollowUps";
import { TableSkeleton } from "../../ui/primitives";
import { clientDisplayName } from "../events/clientName";

/**
 * Sent proposals with no answer and the follow-up each one needs next: a
 * day 3 note, a day 10 check-in, a day 21 "close the file" email. Staff copy
 * the wording, send it their usual way, then mark it sent.
 */
export function ProposalFollowUps({
  proposals,
  clients,
  onOpen,
  onNotice,
  onFailure,
}: {
  proposals: readonly FollowUpProposal[] | undefined;
  clients: Parameters<typeof clientDisplayName>[1];
  onOpen: (proposalId: string) => void;
  onNotice: (message: string) => void;
  onFailure: (error: unknown) => void;
}) {
  const recordFollowUp = useProposalRecordFollowUp();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = proposals ? proposalFollowUps(proposals, Date.now()) : undefined;
  const dueCount = rows?.filter((row) => row.due).length ?? 0;
  // Only the ones due now, so the proposals list below stays in reach.
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows?.filter((row) => row.due);
  const hiddenCount = (rows?.length ?? 0) - (shown?.length ?? 0);

  const copyNote = async (row: FollowUpRow) => {
    if (!row.next) return;
    const name = clientDisplayName(row.clientId, clients);
    try {
      await navigator.clipboard.writeText(row.next.note(name, row.title));
      onNotice(
        `${row.next.label} wording copied. Send it, then press Mark sent.`,
      );
    } catch {
      onNotice(
        "Copying is blocked in this browser. Select the wording and copy it.",
      );
    }
  };

  const markSent = async (row: FollowUpRow) => {
    if (!row.next) return;
    setBusy(row.proposalId);
    try {
      await recordFollowUp({ docId: row.proposalId, step: row.next.step });
      onNotice(`${row.next.label} marked sent for ${row.title}.`);
    } catch (error) {
      onFailure(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="working-ledger" aria-labelledby="proposal-follow-ups">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Waiting on the client</p>
          <h2 id="proposal-follow-ups">Follow-ups</h2>
        </div>
        <span>
          {rows === undefined
            ? "…"
            : `${dueCount} due now · ${rows.length} waiting`}
        </span>
      </div>
      {rows === undefined ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No proposal is waiting on a client.</p>
          <span>
            A sent proposal shows here until the client accepts or declines: a
            note on day 3, a check-in on day 10, and a last email on day 21.
          </span>
        </div>
      ) : shown?.length === 0 ? (
        <p className="p-4 text-base text-ink-2">Nothing is due today.</p>
      ) : (
        <table className="data-table phone-cards">
          <thead>
            <tr>
              <th>Proposal</th>
              <th>Sent</th>
              <th>Done</th>
              <th>Next</th>
              <th>Wording</th>
            </tr>
          </thead>
          <tbody>
            {(shown ?? []).map((row) => (
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
                <td data-label="Sent">
                  {formatDate(row.sentAt)}
                  {row.opened ? (
                    <p className="text-xs text-ink-3">Opened by the client</p>
                  ) : null}
                </td>
                <td data-label="Done">
                  {row.done
                    ? `${row.done.label}${row.doneAt ? `, ${formatDate(row.doneAt)}` : ""}`
                    : "None yet"}
                </td>
                <td data-label="Next">
                  {row.next ? (
                    <>
                      <strong>{row.next.label}</strong>
                      <p className="text-xs text-ink-3">
                        {row.due
                          ? "Due now"
                          : `Due ${formatDate(row.nextDueAt)}`}
                      </p>
                    </>
                  ) : (
                    "All three sent"
                  )}
                </td>
                <td data-label="Wording">
                  {row.next ? (
                    <div className="supply-row-actions">
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => void copyNote(row)}
                      >
                        Copy wording
                      </button>
                      <button
                        className={
                          row.due ? "btn btn-primary" : "btn btn-ghost"
                        }
                        type="button"
                        disabled={busy === row.proposalId}
                        onClick={() => void markSent(row)}
                      >
                        Mark sent
                      </button>
                    </div>
                  ) : (
                    <span className="text-ink-3">
                      Mark it declined if they went elsewhere.
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows !== undefined && (hiddenCount > 0 || showAll) ? (
        <button
          className="btn btn-ghost mt-3"
          type="button"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? "Show only the ones due now"
            : `Show ${hiddenCount} not due yet`}
        </button>
      ) : null}
    </section>
  );
}
