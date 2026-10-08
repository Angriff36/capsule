import { useMemo, useState } from "react";
import {
  useCreateProductionBatch,
  useListComponent,
  useProductionBatchCorrectYield,
  useProductionBatchResolveShortfall,
} from "../../lib/manifest-convex-react";
import { useFinishedBatches } from "../../lib/productionScopedQueries";
import { useActionPrompt } from "../../ui/action-prompt";
import { useEventsById } from "../facilities/useEventsById";
import { batchShortfallLabel } from "./batchCompletion";
import { ProductionFailureBanner } from "./ProductionFailureBanner";

const RECENT_MS = 24 * 60 * 60 * 1000;

/**
 * Finished batches: what was made against the plan, what was wasted, and
 * what a short batch still owes. The cook plans a make-up batch, says no more
 * is needed, or fixes a miscount. The plan itself never changes.
 */
export function BatchShortfallPanel() {
  // Only finished batches this card shows (still owed, or done in the last
  // day), newest first; older ones load when the cook asks.
  const finished = useFinishedBatches();
  const batches = finished.batches;
  const components = useListComponent();
  const eventIds = useMemo(
    () =>
      batches === undefined ? undefined : batches.map((batch) => batch.eventId),
    [batches],
  );
  const events = useEventsById(eventIds);
  const planBatch = useCreateProductionBatch();
  const resolveShortfall = useProductionBatchResolveShortfall();
  const correctYield = useProductionBatchCorrectYield();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);
  const now = Date.now();

  const componentName = (id: string) =>
    components?.find((component) => component._id === id)?.name ?? "Recipe";
  const eventName = (id: string | null | undefined) =>
    (id && events?.find((event) => event._id === id)?.title) || "House";

  const rows = (batches ?? [])
    .filter((batch) => {
      if (batch.deletedAt != null || String(batch.status) !== "completed")
        return false;
      const owes =
        Number(batch.shortfallQuantity ?? 0) > 0 &&
        batch.shortfallResolvedAt == null;
      return owes || now - Number(batch.completedAt ?? 0) < RECENT_MS;
    })
    .sort((left, right) => {
      const owes = (batch: typeof left) =>
        Number(batch.shortfallQuantity ?? 0) > 0 &&
        batch.shortfallResolvedAt == null
          ? 0
          : 1;
      return (
        owes(left) - owes(right) ||
        Number(right.completedAt ?? 0) - Number(left.completedAt ?? 0)
      );
    });

  if (rows.length === 0) return null;

  const run = (id: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(id);
    void (async () => {
      try {
        await work();
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(null);
      }
    })();
  };

  const makeTheRest = async (batch: (typeof rows)[number]) => {
    const name = componentName(String(batch.componentId));
    const missing = Number(batch.shortfallQuantity);
    const ok = await prompt.askConfirm({
      title: "Make the rest",
      description: `Plan a new batch of ${missing} ${batch.yieldUnit} of ${name} for ${eventName(batch.eventId)}.`,
      confirmLabel: "Plan batch",
      cancelLabel: "Not now",
    });
    if (!ok) return;
    run(batch._id, () =>
      planBatch({
        componentId: batch.componentId,
        plannedYield: missing,
        yieldUnit: batch.yieldUnit,
        eventId: batch.eventId ?? undefined,
        makeUpForBatchId: batch._id,
        notes: `Make-up for a short batch of ${name}`,
      }),
    );
  };

  const noMoreNeeded = async (batch: (typeof rows)[number]) => {
    const resolution = (
      await prompt.askReason({
        title: "No more needed",
        description: `${componentName(String(batch.componentId))} came out short. Say why no more is needed.`,
        label: "Why",
        placeholder: "Guest count dropped, the extra pan covers it…",
        confirmLabel: "Save",
      })
    )?.trim();
    if (!resolution) return;
    run(batch._id, () =>
      resolveShortfall({
        docId: batch._id,
        version: batch.version,
        resolution,
      }),
    );
  };

  const fixCount = async (batch: (typeof rows)[number]) => {
    const values = await prompt.askFields({
      title: "Fix the count",
      description: `The first count stays on record. Planned ${batch.plannedYield} ${batch.yieldUnit}.`,
      fields: [
        {
          name: "count",
          label: `Actual yield (${batch.yieldUnit})`,
          inputType: "number",
          defaultValue: String(batch.actualYield ?? ""),
          required: true,
        },
        { name: "reason", label: "Why it changed", required: true },
      ],
      confirmLabel: "Save count",
    });
    if (!values) return;
    const actualYield = Number(values.count);
    if (!Number.isFinite(actualYield) || actualYield < 0) {
      setFailure(
        new Error("The actual yield can't be negative. Use zero or more."),
      );
      return;
    }
    run(batch._id, () =>
      correctYield({
        docId: batch._id,
        version: batch.version,
        actualYield,
        reason: values.reason ?? "",
      }),
    );
  };

  return (
    <section className="kds-shares" aria-label="Finished batches">
      <h2>Finished batches</h2>
      <p>What each batch made against its plan, and what is still owed.</p>
      {failure != null ? <ProductionFailureBanner error={failure} /> : null}
      {host}
      <ul className="kds-grid">
        {rows.map((batch) => {
          const short = batchShortfallLabel(
            batch.shortfallQuantity,
            String(batch.yieldUnit),
          );
          const owes = short != null && batch.shortfallResolvedAt == null;
          return (
            <li key={batch._id} className="kds-card">
              <div className="kds-card-top">
                <span className="kds-status">
                  {owes ? "Still owed" : "Done"}
                </span>
                <span className="kds-due">{eventName(batch.eventId)}</span>
              </div>
              <h2>{componentName(String(batch.componentId))}</h2>
              <p className="kds-detail">
                Made {batch.actualYield ?? 0} of {batch.plannedYield}{" "}
                {batch.yieldUnit}
                {short ? ` · ${short}` : ""}
              </p>
              {Number(batch.wasteQuantity ?? 0) > 0 ? (
                <p className="kds-detail">
                  Wasted {batch.wasteQuantity} {batch.yieldUnit}
                  {batch.wasteReason ? ` · ${batch.wasteReason}` : ""}
                </p>
              ) : null}
              {batch.shortfallResolution ? (
                <p className="kds-detail">
                  Settled: {batch.shortfallResolution}
                </p>
              ) : null}
              {owes ? (
                <>
                  <button
                    type="button"
                    className="kds-bump"
                    disabled={busy != null}
                    onClick={() => void makeTheRest(batch)}
                  >
                    {busy === batch._id ? "…" : "Make the rest"}
                  </button>
                  <button
                    type="button"
                    className="kds-secondary"
                    disabled={busy != null}
                    onClick={() => void noMoreNeeded(batch)}
                  >
                    No more needed
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="kds-secondary"
                disabled={busy != null}
                onClick={() => void fixCount(batch)}
              >
                Fix the count
              </button>
            </li>
          );
        })}
      </ul>
      {finished.canLoadMore || finished.loadingMore ? (
        <button
          type="button"
          className="kds-secondary"
          disabled={finished.loadingMore}
          onClick={finished.loadMore}
        >
          {finished.loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
