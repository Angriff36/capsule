import { useState } from "react";
import {
  useListComponent,
  useListEvent,
  useListProductionBatch,
  useListProductionBatchAllocation,
  useProductionBatchAllocationMarkPortioned,
} from "../../lib/manifest-convex-react";
import { formatStatusLabel } from "../../lib/statusLabels";
import { ProductionFailureBanner } from "./ProductionFailureBanner";

const PORTIONABLE = "produced";

/**
 * Every live share of a batch, grouped under the batch that carries it.
 * Completing a batch marks its shares produced; portioning each share is the
 * separate step this panel gives the floor.
 */
export function BatchAllocationsPanel() {
  const allocations = useListProductionBatchAllocation();
  const batches = useListProductionBatch();
  const components = useListComponent();
  const events = useListEvent();
  const markPortioned = useProductionBatchAllocationMarkPortioned();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const batchOf = (id: string) =>
    (batches ?? []).find((batch) => batch._id === id);
  const componentName = (id: string) =>
    components?.find((component) => component._id === id)?.name ?? "Recipe";
  const shareLabel = (row: any) =>
    row.isSurplus
      ? "Production surplus"
      : row.eventId
        ? (events?.find((event) => event._id === row.eventId)?.title ??
          "Unknown event")
        : "Unassigned share";

  const groups = new Map<string, any[]>();
  for (const row of allocations ?? []) {
    if (row.deletedAt != null) continue;
    if (String(row.status) === "released") continue;
    const batch = batchOf(String(row.productionBatchId));
    if (!batch || batch.deletedAt != null) continue;
    if (String(batch.status) === "cancelled") continue;
    const bucket = groups.get(String(row.productionBatchId));
    if (bucket) bucket.push(row);
    else groups.set(String(row.productionBatchId), [row]);
  }

  // Batches with a share waiting to be portioned lead the list.
  const ordered = [...groups.entries()].sort((left, right) => {
    const waiting = (rows: any[]) =>
      rows.some((row) => String(row.status) === PORTIONABLE) ? 0 : 1;
    return waiting(left[1]) - waiting(right[1]);
  });

  if (ordered.length === 0) return null;

  const portionShare = (row: any) => {
    setFailure(null);
    setBusy(row._id);
    void (async () => {
      try {
        await markPortioned({ docId: row._id, version: row.version });
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(null);
      }
    })();
  };

  return (
    <section className="kds-shares" aria-label="Batch shares">
      <h2>Batch shares</h2>
      <p>Who each batch is being made for, and what is still to portion.</p>
      {failure != null ? <ProductionFailureBanner error={failure} /> : null}
      <ul className="kds-grid">
        {ordered.map(([batchId, rows]) => {
          const batch = batchOf(batchId);
          return (
            <li key={batchId} className="kds-card">
              <div className="kds-card-top">
                <span className="kds-status">
                  {componentName(String(batch?.componentId ?? ""))}
                </span>
                <span className="kds-due">
                  {formatStatusLabel(String(batch?.status ?? ""))}
                </span>
              </div>
              <ul className="kds-shares-list">
                {rows.map((row) => {
                  const status = String(row.status);
                  const ready = status === PORTIONABLE;
                  return (
                    <li key={row._id}>
                      <span>
                        <strong>{shareLabel(row)}</strong>
                        <small>
                          {row.allocatedQuantity} {row.unit} ·{" "}
                          {formatStatusLabel(status)}
                        </small>
                      </span>
                      <button
                        type="button"
                        className="kds-secondary"
                        disabled={busy != null || !ready}
                        title={
                          ready
                            ? undefined
                            : status === "portioned"
                              ? "This share is already portioned."
                              : "A share can be portioned once the batch is completed."
                        }
                        onClick={() => portionShare(row)}
                      >
                        {busy === row._id ? "…" : "Portioned"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
