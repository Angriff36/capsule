import { formatQuantity } from "../../lib/format";
import { useEffect, useRef, useState } from "react";
import { closeModal, openModal } from "../../ui/action-prompt/dialogFocus";
import {
  type DemandChangeRequest,
  useDemandChangePreview,
} from "../../lib/culinaryDemandClient";

type Props = {
  request: DemandChangeRequest;
  onClose: () => void;
  onApply: (fingerprint: string) => Promise<unknown>;
  onApplied?: () => void;
};

const titleFor = (kind: DemandChangeRequest["kind"]) =>
  kind === "headcount"
    ? "Review headcount impact"
    : kind === "supersede"
      ? "Review demand supersession"
      : "Review demand recalculation";

/** A compact operational ledger before a destructive demand-side effect. */
export function DemandChangePreviewDialog({
  request,
  onClose,
  onApply,
  onApplied,
}: Props) {
  const preview = useDemandChangePreview(request);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A native modal opens in the top layer, above an open edit sheet.
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openModal(dialog);
    return () => closeModal(dialog);
  }, []);
  const changed =
    preview?.lines.filter((line) => line.change !== "unchanged") ?? [];
  // A guest-count change still applies when no ingredient quantity moves.
  const canApply =
    preview !== undefined &&
    (changed.length > 0 || request.kind === "headcount");

  const apply = async () => {
    if (!preview || !canApply) return;
    setApplying(true);
    setError(null);
    try {
      await onApply(preview.fingerprint);
      onApplied?.();
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not apply this demand change.",
      );
    } finally {
      setApplying(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="demand-change-preview-title"
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-end justify-center border-0 bg-ink/35 p-4 sm:items-center"
      onCancel={(event) => {
        event.preventDefault();
        if (!applying) onClose();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !applying) onClose();
      }}
    >
      <section className="w-full max-w-4xl rounded-ledger border border-line-2 bg-panel shadow-2xl">
        <header className="border-b border-ink px-5 py-4 sm:px-7">
          <p className="eyebrow text-brand">Before you apply</p>
          <h2
            id="demand-change-preview-title"
            className="mt-1 text-2xl font-bold text-ink"
          >
            {titleFor(request.kind)}
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            Current quantities are shown beside the resulting quantities.
            Confirm once to apply exactly this review.
          </p>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 sm:px-7">
          {preview === undefined ? (
            <p className="text-sm text-ink-2">
              Calculating the resulting demand…
            </p>
          ) : changed.length === 0 ? (
            <p className="rounded-md border border-line bg-inset p-4 text-sm text-ink-2">
              No quantity changes result from this action.
            </p>
          ) : (
            <>
              {preview.affectedPurchaseNeeds.length > 0 ? (
                <aside
                  className="mb-4 border-l-4 border-warning bg-warning-soft px-4 py-3"
                  role="note"
                >
                  <p className="font-semibold text-ink">
                    {preview.affectedPurchaseNeeds.length} purchase need
                    {preview.affectedPurchaseNeeds.length === 1 ? "" : "s"} will
                    change
                  </p>
                  <p className="mt-1 text-sm text-ink-2">
                    {preview.affectedPurchaseNeeds.some(
                      (need) => need.isCommitted,
                    )
                      ? "An ordered or fulfilled purchase need is affected. Confirm only after checking the purchasing change."
                      : "Open purchasing needs are highlighted below before their quantities update."}
                  </p>
                </aside>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink text-xs uppercase tracking-wider text-ink-2">
                    <tr>
                      <th className="py-2 pr-3">Ingredient</th>
                      <th className="py-2 pr-3 text-right">Current</th>
                      <th className="py-2 pr-3 text-right">Resulting</th>
                      <th className="py-2 text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changed.map((line) => (
                      <tr
                        key={line.key}
                        className="border-b border-line bg-accent-soft/45"
                      >
                        <td className="py-3 pr-3 font-medium text-ink">
                          {line.ingredientName}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono text-ink-2">
                          {formatQuantity(line.currentQuantity)} {line.unit}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono font-semibold text-ink">
                          {formatQuantity(line.nextQuantity)} {line.unit}
                        </td>
                        <td className="py-3 text-right font-semibold text-brand">
                          {line.change}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {error ? (
            <p className="mt-4 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-7">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={applying}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={applying || !canApply}
            onClick={() => void apply()}
          >
            {applying ? "Applying…" : "Confirm and apply"}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
