import { useEffect, useRef, type KeyboardEvent } from "react";
import { StudioCatalogPreview } from "./StudioCatalogPreview";
import { StudioCatalogSwapPicker } from "./StudioCatalogSwapPicker";
import type { StudioEditDraft } from "./StudioEditDraft";
import { StudioPreviewModel } from "./StudioPreviewModel";

export function StudioEditPopover(props: {
  draft: StudioEditDraft;
  text: string;
  saving: boolean;
  componentId: string;
  onText: (value: string) => void;
  onComponent: (id: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!props.draft.copyEditable) return;
    field.current?.focus();
    field.current?.select();
  }, [props.draft.copyEditable]);

  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onCancel();
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      props.onSave();
    }
  };

  const left = Math.max(
    12,
    Math.min(props.draft.x + 12, window.innerWidth - 468),
  );
  const top = Math.max(
    12,
    Math.min(props.draft.y + 12, window.innerHeight - 520),
  );
  const slot = props.draft.slot;
  const nowId = slot?.name ?? props.componentId;
  const preview = StudioPreviewModel.from(
    props.text || slot?.previewTitle || "",
  );
  const layoutChanged = Boolean(slot && props.componentId !== nowId);
  const wordsReady = props.draft.copyEditable && props.text.trim().length > 0;
  const canSave = !props.saving && (layoutChanged || wordsReady);

  return (
    <div
      role="dialog"
      aria-label="Edit this part of the app"
      className="fixed z-[9997] max-h-[90vh] w-[28rem] overflow-y-auto rounded-md border border-line bg-panel p-3 text-sm text-ink shadow-lg"
      style={{ left, top }}
    >
      <p className="mb-2 truncate text-xs text-ink-3">
        {slot?.previewTitle || props.draft.copy.targetLabel}
      </p>
      {props.draft.copyEditable ? (
        <label className="mb-2 block text-xs font-semibold text-ink">
          Words
          <textarea
            ref={field}
            value={props.text}
            onChange={(event) => props.onText(event.target.value)}
            onKeyDown={keys}
            rows={3}
            className="mt-1 w-full rounded-sm border border-line bg-panel p-2 text-sm text-ink"
          />
        </label>
      ) : null}
      {slot ? (
        <>
          <p className="mb-2 text-sm text-ink-2">
            Now is this block. After save is the catalog piece you pick.
          </p>
          <div className="mb-3 flex gap-2">
            <StudioCatalogPreview
              caption="Now"
              componentId={nowId}
              model={preview}
            />
            <StudioCatalogPreview
              caption={layoutChanged ? "After save" : "After save (pick one)"}
              componentId={props.componentId}
              model={preview}
            />
          </div>
          <StudioCatalogSwapPicker
            kind={slot.kind}
            currentId={nowId}
            selectedId={props.componentId}
            onSelect={props.onComponent}
          />
        </>
      ) : (
        <p className="mb-2 text-sm text-ink-2">
          This click was words only. Click a heading, empty state, chip, or
          other catalog block to switch the piece.
        </p>
      )}
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          className="rounded-sm px-3 py-1 text-sm text-ink hover:bg-inset"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSave}
          className="btn btn-primary btn-sm"
          onClick={props.onSave}
        >
          {props.saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
