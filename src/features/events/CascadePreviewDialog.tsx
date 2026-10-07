import {
  type CascadeAction,
  useEventCascadePreview,
} from "../../lib/cascadePreviewClient";
import { useEffect, useRef } from "react";
import { closeModal, openModal } from "../../ui/action-prompt/dialogFocus";
import { FieldHelp } from "../../ui/FieldHelp";

type Props = {
  eventId: string;
  action: CascadeAction;
  onClose: () => void;
  onConfirm: () => void;
};

const COPY: Record<CascadeAction, { title: string; confirm: string }> = {
  approve: { title: "Approve this event?", confirm: "Approve event" },
  closeOut: { title: "Close out this event?", confirm: "Close out event" },
};

/** The downstream work a stage move sets off, shown before it fires. */
export function CascadePreviewDialog({
  eventId,
  action,
  onClose,
  onConfirm,
}: Props) {
  const preview = useEventCascadePreview(eventId, action);
  const copy = COPY[action];
  // A native modal opens in the top layer, above an open event sheet.
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    openModal(dialog);
    return () => closeModal(dialog);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="cascade-preview-title"
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-end justify-center border-0 bg-ink/35 p-4 sm:items-center"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="w-full max-w-lg rounded-ledger border border-line-2 bg-panel shadow-2xl">
        <header className="border-b border-ink px-5 py-4 sm:px-7">
          <p className="eyebrow text-brand">Before you confirm</p>
          <h2
            id="cascade-preview-title"
            className="mt-1 text-2xl font-bold text-ink"
          >
            <span className="field-label-row">
              {copy.title}
              {action === "closeOut" ? <FieldHelp term="closeout" /> : null}
            </span>
          </h2>
        </header>
        <div className="px-5 py-4 sm:px-7">
          {preview === undefined ? (
            <p className="text-sm text-ink-2">
              Checking what this will set off…
            </p>
          ) : preview === null || preview.effects.length === 0 ? (
            <p className="text-sm text-ink-2">
              Nothing else is created. Only the event's stage changes.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-2">This will also:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
                {preview.effects.map((effect) => (
                  <li key={effect.key}>{effect.label}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-4 sm:px-7">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {copy.confirm}
          </button>
        </footer>
      </section>
    </dialog>
  );
}
