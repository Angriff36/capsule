import { useState } from "react";
import { formatCountNoun, formatDate, formatMoney } from "../../lib/format";
import { useWasteRecordVoidRecord } from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { WASTE_REASON_LABELS } from "./WasteRecordForm";

const MAX_ROWS = 20;

/**
 * The individual entries behind the totals above, newest first, so a wrong
 * entry can be voided. A voided entry leaves this list and stops counting,
 * exactly as the report filters it.
 */
export function WasteRecentEntries({
  records,
  ingredients,
  events,
  periodDays,
  periodLabel,
}: {
  records: readonly any[] | undefined;
  ingredients: readonly any[] | undefined;
  events: readonly any[] | undefined;
  periodDays: number | null;
  periodLabel: string;
}) {
  const voidRecord = useWasteRecordVoidRecord();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const cutoff =
    periodDays == null ? 0 : Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const occurredAt = (record: any) =>
    record.recordedAt ?? record.createdAt ?? record._creationTime;
  const live = (records ?? [])
    .filter(
      (record) =>
        record.deletedAt == null &&
        record.status === "recorded" &&
        occurredAt(record) >= cutoff,
    )
    .sort((left, right) => occurredAt(right) - occurredAt(left));
  const rows = live.slice(0, MAX_ROWS);

  const ingredientName = (id: string) =>
    ingredients?.find((row) => row._id === id)?.name ?? "Unknown ingredient";
  const eventName = (id: string | null | undefined) =>
    id
      ? (events?.find((row) => row._id === id)?.title ?? "Unknown event")
      : "No event · kitchen operations";

  const voidAction = (record: any) => {
    void (async () => {
      const reason = (
        await prompt.askReason({
          title: "Void waste entry",
          description: `${record.quantity} ${record.unit} of ${ingredientName(
            record.ingredientId,
          )} stops counting towards waste cost.`,
          label: "Void reason",
          confirmLabel: "Void entry",
          cancelLabel: "Keep entry",
          tone: "danger",
        })
      )?.trim();
      if (!reason) return;
      setFailure(null);
      setBusy(record._id);
      try {
        await voidRecord({
          docId: record._id,
          version: record.version,
          reason,
        });
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <section className="working-ledger">
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">{periodLabel}</p>
          <h2>Recent entries</h2>
        </div>
        <span>{formatCountNoun(live.length, "entry", "entries")}</span>
      </div>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}
      {records === undefined || ingredients === undefined ? (
        <TableSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>No recorded waste in this period.</p>
          <span>
            Each entry you record appears here, so a wrong quantity or reason
            can be voided out of the totals.
          </span>
        </div>
      ) : (
        <div className="supply-table-wrap">
          <table className="supply-table" data-testid="waste-recent-entries">
            <thead>
              <tr>
                <th>When</th>
                <th>Ingredient</th>
                <th>Quantity</th>
                <th>Reason</th>
                <th>Event</th>
                <th>Waste value</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((record) => (
                <tr key={record._id}>
                  <td>{formatDate(occurredAt(record))}</td>
                  <td>
                    <strong>{ingredientName(record.ingredientId)}</strong>
                    {record.notes ? <small>{record.notes}</small> : null}
                  </td>
                  <td className="supply-number">
                    {record.quantity} {record.unit}
                  </td>
                  <td>{WASTE_REASON_LABELS[record.reason] ?? record.reason}</td>
                  <td>{eventName(record.eventId)}</td>
                  <td className="supply-number">
                    {formatMoney(record.quantity * record.unitCost)}
                  </td>
                  <td>
                    <div className="supply-row-actions">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={busy != null}
                        onClick={() => voidAction(record)}
                      >
                        {busy === record._id ? "Working…" : "Void"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {live.length > rows.length ? (
            <p className="field-hint">
              Showing the {MAX_ROWS} most recent of {live.length} entries in
              this period.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
