import { useCallback, useState } from "react";
import { reportActionFail, reportActionOk } from "../../ui/action-result";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { useStudio } from "./StudioContext";
import { StudioRoles } from "./StudioRoles";
import { StudioChangesPanel } from "./StudioChangesPanel";
import {
  StudioEditDraftFactory,
  type StudioEditDraft,
} from "./StudioEditDraft";
import { StudioEditPopover } from "./StudioEditPopover";

const LAYER_ATTR = "data-studio-layer";

export function StudioEditorLayer() {
  const studio = useStudio();
  const status = useAuthStatus();
  if (!studio?.canEdit && !StudioRoles.canEdit(status?.role)) return null;
  return <StudioEditorSurface />;
}

function StudioEditorSurface() {
  const studio = useStudio();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [hover, setHover] = useState<DOMRect | null>(null);
  const [draft, setDraft] = useState<StudioEditDraft | null>(null);
  const [text, setText] = useState("");
  const [componentId, setComponentId] = useState("PageHeader");
  const [saving, setSaving] = useState(false);

  const stopPicking = useCallback(() => {
    setPicking(false);
    setHover(null);
  }, []);

  // The editor tab shows once the screen editor has loaded.
  if (!studio) return null;

  const pick = (x: number, y: number) => {
    const next = StudioEditDraftFactory.fromPoint(
      x,
      y,
      studio.pagePattern,
      LAYER_ATTR,
    );
    stopPicking();
    if (!next) return;
    const saved = studio.copy.matching(next.copy);
    setDraft(next);
    setText(
      saved?.text ??
        (next.copyEditable
          ? next.copy.originalText
          : (next.slot?.previewTitle ?? "")),
    );
    setComponentId(
      next.slot
        ? studio.layout.componentId(
            studio.pagePattern,
            next.slot.slotKey,
            next.slot.name,
          )
        : "PageHeader",
    );
  };

  const save = async () => {
    if (!draft) return;
    if (!studio.ready) {
      reportActionFail("Reload the page, then save again.");
      return;
    }
    setSaving(true);
    try {
      if (
        draft.copyEditable &&
        draft.copy.originalText &&
        text.trim() !== draft.copy.originalText
      ) {
        await studio.copy.save(draft.copy, text);
      }
      if (draft.slot && componentId) {
        if (componentId === draft.slot.name) {
          await studio.layout.revert(studio.pagePattern, draft.slot.slotKey);
        } else {
          await studio.layout.save({
            pagePattern: studio.pagePattern,
            slotKey: draft.slot.slotKey,
            componentId,
            sourceComponentId: draft.slot.name,
            slotKind: draft.slot.kind,
            targetSelector: draft.slot.selector,
            targetLabel: draft.slot.label,
          });
        }
      }
      reportActionOk("Saved. Everyone in the company sees this.");
      setDraft(null);
    } catch (error) {
      reportActionFail(
        error instanceof Error ? error.message : "Could not save that change.",
      );
    } finally {
      setSaving(false);
    }
  };

  const revertCopy = async (copyKey: string) => {
    try {
      await studio.copy.revertKey(studio.pagePattern, copyKey);
      reportActionOk("Original words are back.");
    } catch (error) {
      reportActionFail(
        error instanceof Error ? error.message : "Could not restore that.",
      );
    }
  };

  const revertLayout = async (slotKey: string) => {
    try {
      await studio.layout.revert(studio.pagePattern, slotKey);
      reportActionOk("Original catalog piece is back.");
    } catch (error) {
      reportActionFail(
        error instanceof Error ? error.message : "Could not restore that.",
      );
    }
  };

  return (
    <div {...{ [LAYER_ATTR]: "" }} className="print:hidden">
      {!open && !picking && !draft ? (
        <EditAppTab onClick={() => setOpen(true)} />
      ) : null}

      {open && !picking && !draft ? (
        <StudioChangesPanel
          pagePattern={studio.pagePattern}
          copy={studio.copy}
          layout={studio.layout}
          onClose={() => setOpen(false)}
          onPick={() => setPicking(true)}
          onRevertCopy={(copyKey) => void revertCopy(copyKey)}
          onRevertLayout={(slotKey) => void revertLayout(slotKey)}
        />
      ) : null}

      {picking ? (
        <>
          <div
            className="fixed inset-0 z-[9995] cursor-crosshair"
            onMouseMove={(event) => {
              const element = document
                .elementsFromPoint(event.clientX, event.clientY)
                .find((node) => !node.closest(`[${LAYER_ATTR}]`));
              setHover(element ? element.getBoundingClientRect() : null);
            }}
            onClick={(event) => pick(event.clientX, event.clientY)}
            onKeyDown={(event) => {
              if (event.key === "Escape") stopPicking();
            }}
          />
          {hover ? (
            <div
              className="pointer-events-none fixed z-[9994] rounded-xs border-2 border-accent bg-accent-soft/30"
              style={{
                left: hover.left,
                top: hover.top,
                width: hover.width,
                height: hover.height,
              }}
            />
          ) : null}
          <div className="fixed left-1/2 top-3 z-[9996] flex -translate-x-1/2 items-center gap-3 rounded-md bg-ink px-4 py-2 text-sm text-panel shadow-lg">
            Click the words or block you want to change.
            <button
              type="button"
              className="rounded-sm border border-panel/40 px-2 py-0.5 text-xs"
              onClick={stopPicking}
            >
              Stop (Esc)
            </button>
          </div>
        </>
      ) : null}

      {draft ? (
        <StudioEditPopover
          draft={draft}
          text={text}
          saving={saving}
          componentId={componentId}
          onText={setText}
          onComponent={setComponentId}
          onCancel={() => setDraft(null)}
          onSave={() => void save()}
        />
      ) : null}
    </div>
  );
}

function EditAppTab(props: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
      className="fixed right-0 top-[42%] z-[9991] flex -translate-y-1/2 flex-col items-center gap-1 rounded-md border border-r-0 border-line bg-panel px-1.5 py-3 text-xs font-semibold text-ink shadow-md hover:bg-inset"
      aria-label="Edit app"
    >
      <span className="[writing-mode:vertical-rl]">Edit app</span>
    </button>
  );
}
