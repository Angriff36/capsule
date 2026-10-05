import { useState } from "react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  canReadCulinaryDemand,
  unresolvedItemText,
  unresolvedKindLabel,
  useApplyDemandRecalculation,
  useEventDemandReview,
} from "../../lib/culinaryDemandClient";
import { CHIP_TONE_CLASS } from "../../lib/statusLabels";
import { StatusChip } from "../../ui/primitives";
import { DemandChangePreviewDialog } from "../inventory/DemandChangePreviewDialog";

/** What this event still cannot order or cook, straight from the one demand
 *  calculation. Silent when every material resolves and the total is whole. */
const RECALCULATE_ROLES = new Set([
  "inventory_staff",
  "procurement_staff",
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

export function EventUnresolvedMaterialsNotice({
  eventId,
}: {
  eventId: string;
}) {
  const authStatus = useAuthStatus();
  // Roles the server does not let read demand see nothing here rather than
  // a refused read breaking the screen.
  const review = useEventDemandReview(
    eventId,
    canReadCulinaryDemand(authStatus?.role),
  );
  const applyRecalculation = useApplyDemandRecalculation();
  // Recalculating writes purchasing rows, which need inventory or manager
  // access; only offer the button to roles the commands will accept.
  const canRecalculate = RECALCULATE_ROLES.has(authStatus?.role ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

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

  const recalculate = async (fingerprint: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await applyRecalculation(eventId, fingerprint);
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
        {canRecalculate ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => setShowPreview(true)}
          >
            {busy ? "Working…" : "Recalculate demand"}
          </button>
        ) : (
          <span className="text-sm text-ink-2">
            A manager or inventory staff can recalculate demand.
          </span>
        )}
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
                {unresolvedItemText(item)}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {showPreview ? (
        <DemandChangePreviewDialog
          request={{ eventId, kind: "recalculate" }}
          onClose={() => setShowPreview(false)}
          onApply={recalculate}
        />
      ) : null}
    </section>
  );
}
