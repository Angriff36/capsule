import {
  STUDIO_CATALOG,
  studioCatalogForKind,
  type StudioCatalogEntry,
  type StudioCatalogKind,
} from "./StudioCatalog";

export function StudioCatalogSwapPicker(props: {
  kind: StudioCatalogKind;
  currentId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const fitting = studioCatalogForKind(props.kind);
  const extras = STUDIO_CATALOG.filter(
    (entry) => !fitting.some((choice) => choice.id === entry.id),
  );
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 text-xs font-semibold text-ink">
        Switch this block to
      </legend>
      <PieceGroup
        label="Fits this spot"
        entries={fitting}
        currentId={props.currentId}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
      />
      {extras.length > 0 ? (
        <PieceGroup
          label="Other catalog pieces"
          entries={extras}
          currentId={props.currentId}
          selectedId={props.selectedId}
          onSelect={props.onSelect}
        />
      ) : null}
    </fieldset>
  );
}

function PieceGroup(props: {
  label: string;
  entries: StudioCatalogEntry[];
  currentId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-1 text-xs tracking-[0.04em] text-ink-3 uppercase">
        {props.label}
      </p>
      <div className="grid max-h-40 gap-1 overflow-y-auto">
        {props.entries.map((entry) => {
          const selected = entry.id === props.selectedId;
          return (
            <label
              key={entry.id}
              className={`flex cursor-pointer items-center gap-2 rounded-sm border px-2 py-1.5 text-sm ${
                selected
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-line bg-panel text-ink hover:bg-inset"
              }`}
            >
              <input
                type="radio"
                name="studio-catalog-piece"
                value={entry.id}
                checked={selected}
                onChange={() => props.onSelect(entry.id)}
                className="accent-accent"
              />
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              {entry.id === props.currentId ? (
                <span className="shrink-0 text-xs text-ink-3">Now</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}
