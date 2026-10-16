import type { StudioCopyManager } from "./StudioCopyManager";
import type { StudioLayoutManager } from "./StudioLayoutManager";

export function StudioChangesPanel(props: {
  pagePattern: string;
  ready: boolean;
  copy: StudioCopyManager;
  layout: StudioLayoutManager;
  onClose: () => void;
  onPick: () => void;
  onRevertCopy: (copyKey: string) => void;
  onRevertLayout: (slotKey: string) => void;
}) {
  const copies = props.copy.liveOn(props.pagePattern);
  const layouts = props.layout.liveOn(props.pagePattern);

  return (
    <aside
      aria-label="App edits"
      className="fixed bottom-0 right-0 top-0 z-[9992] flex w-full flex-col border-l border-line bg-panel text-sm text-ink shadow-lg sm:w-96"
    >
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">App edits</h2>
        <button type="button" className="btn btn-ghost" onClick={props.onClose}>
          Close
        </button>
      </header>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!props.ready}
          onClick={props.onPick}
        >
          Edit a spot
        </button>
        <p className="text-sm text-ink-2">
          Click a heading, button, empty state, or other label on any screen.
          Change the words, or pick another catalog piece. You will see the
          current block next to the one you are switching to before you save.
        </p>
      </div>
      <ol className="flex-1 overflow-y-auto">
        {!props.ready ? (
          <li className="px-4 py-3 text-ink-3">Loading saved edits…</li>
        ) : null}
        {props.ready && copies.length === 0 && layouts.length === 0 ? (
          <li className="px-4 py-3 text-ink-3">No edits on this screen yet.</li>
        ) : null}
        {copies.map((row) => (
          <li key={row.copyKey} className="border-b border-line px-4 py-3">
            <p className="text-xs text-ink-3">
              {row.targetLabel ?? row.copyKey}
            </p>
            <p className="mt-1 text-ink">
              <span className="text-ink-3 line-through">
                {row.originalText}
              </span>
              {" → "}
              {row.text}
            </p>
            <button
              type="button"
              className="text-link mt-1 inline-flex min-h-10"
              onClick={() => props.onRevertCopy(row.copyKey)}
            >
              Use original words
            </button>
          </li>
        ))}
        {layouts.map((row) => (
          <li key={row.slotKey} className="border-b border-line px-4 py-3">
            <p className="text-xs text-ink-3">
              {row.targetLabel ?? row.slotKey}
            </p>
            <p className="mt-1 text-ink">
              {row.sourcePieceName ?? "Catalog"} → {row.pieceName}
            </p>
            <button
              type="button"
              className="text-link mt-1 inline-flex min-h-10"
              onClick={() => props.onRevertLayout(row.slotKey)}
            >
              Use original piece
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
