import {
  type CascadeAction,
  useEventCascadePreview,
} from "../../lib/cascadePreviewClient";

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cascade-preview-title"
        className="w-full max-w-lg rounded-ledger border border-line-2 bg-panel shadow-2xl"
      >
        <header className="border-b border-ink px-5 py-4 sm:px-7">
          <p className="eyebrow text-brand">Before you confirm</p>
          <h2
            id="cascade-preview-title"
            className="mt-1 text-2xl font-bold text-ink"
          >
            {copy.title}
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
    </div>
  );
}
