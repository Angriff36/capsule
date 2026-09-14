import { useState } from "react";
import {
  unresolvedKindLabel,
  useEventDemandReview,
  useReconcileEventDemand,
} from "../../lib/culinaryDemandClient";
import { CHIP_TONE_CLASS } from "../../lib/statusLabels";
import { StatusChip } from "../../ui/primitives";

/** What this event still cannot order or cook, straight from the one demand
 *  calculation. Silent when every material resolves and the total is whole. */
export function EventUnresolvedMaterialsNotice({
  eventId,
}: {
  eventId: string;
}) {
  const review = useEventDemandReview(eventId);
  const reconcile = useReconcileEventDemand();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (review === undefined || review === null) return null;
  const items = review.eventDishes.flatMap((line) => line.unresolved);
  const purchasingIncomplete = !review.purchasing.complete;
  if (items.length === 0 && !purchasingIncomplete) return null;

  const byKind = new Map<string, typeof items>();
  for (const item of items) {
    const group = byKind.get(item.kind) ?? [];
    group.push(item);
    byKind.set(item.kind, group);
  }

  const recalculate = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await reconcile(eventId);
      setNotice(
        `Demand recalculated: ${result.created} added, ${result.updated} changed, ${result.superseded} replaced, ${result.unchanged} unchanged. ${result.unresolvedCount} item${result.unresolvedCount === 1 ? "" : "s"} still unresolved.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not recalculate demand.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="space-y-2 border-y border-line py-3"
      role="status"
      data-testid="event-unresolved-materials"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-warn">
          Unresolved materials
        </h2>
        <StatusChip
          status="unresolved_materials"
          label={`${review.unresolvedCount} to settle`}
          color={CHIP_TONE_CLASS.warn}
        />
        {purchasingIncomplete ? (
          <StatusChip
            status="purchasing_incomplete"
            label="Purchasing total incomplete"
            color={CHIP_TONE_CLASS.warn}
          />
        ) : null}
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => void recalculate()}
        >
          {busy ? "Working…" : "Recalculate demand"}
        </button>
      </div>
      {error ? (
        <p className="text-base text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="text-base text-ink-2">{notice}</p> : null}
      {[...byKind.entries()].map(([kind, group]) => (
        <div key={kind} className="space-y-1">
          <p className="text-sm font-medium text-ink">
            {unresolvedKindLabel(kind)}
          </p>
          <ul className="space-y-1">
            {group.map((item) => (
              <li
                key={`${item.kind}:${item.eventDishId}:${item.refId}`}
                className="text-base text-ink-2"
              >
                {item.label} — {item.detail}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
