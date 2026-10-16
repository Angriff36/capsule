import type { KeyboardEvent } from "react";
import { Dialog } from "../../ui/Dialog";
import { studioSwapChoices } from "./StudioCatalog";
import { StudioCatalogPreview } from "./StudioCatalogPreview";
import { StudioCatalogSwapPicker } from "./StudioCatalogSwapPicker";
import type { StudioEditDraft } from "./StudioEditDraft";
import { StudioPreviewModel } from "./StudioPreviewModel";

/**
 * The edit window for one clicked spot, on the shared Dialog: centered on a
 * computer, a bottom sheet on a phone, focus kept inside and given back, Esc
 * closes it from anywhere in it.
 */
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
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      props.onSave();
    }
  };

  const slot = props.draft.slot;
  const nowId = slot?.name ?? props.componentId;
  const swappable =
    slot != null &&
    studioSwapChoices(slot.kind, slot.name, slot.live).length > 0;
  const preview = StudioPreviewModel.from(
    props.text || slot?.previewTitle || "",
  );
  const layoutChanged = Boolean(slot && props.componentId !== nowId);
  const wordsReady = props.draft.copyEditable && props.text.trim().length > 0;
  const canSave = !props.saving && (layoutChanged || wordsReady);

  return (
    <Dialog
      open
      onClose={props.onCancel}
      dismissible={!props.saving}
      title="Edit this part of the app"
      description={slot?.previewTitle || props.draft.copy.targetLabel}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={props.saving}
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            className="btn btn-primary"
            onClick={props.onSave}
          >
            {props.saving ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      {props.draft.copyEditable ? (
        <label className="mb-2 block text-xs font-semibold text-ink">
          Words
          <textarea
            value={props.text}
            onChange={(event) => props.onText(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={keys}
            rows={3}
            className="mt-1 w-full rounded-sm border border-line bg-panel p-2 text-sm text-ink"
          />
        </label>
      ) : null}
      {slot ? (
        <>
          {swappable ? (
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
                  caption={
                    layoutChanged ? "After save" : "After save (pick one)"
                  }
                  componentId={props.componentId}
                  model={preview}
                />
              </div>
            </>
          ) : null}
          <StudioCatalogSwapPicker
            kind={slot.kind}
            currentId={nowId}
            live={slot.live}
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
    </Dialog>
  );
}
