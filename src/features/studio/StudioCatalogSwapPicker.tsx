import {
  studioCatalogEntry,
  studioSwapChoices,
  type StudioCatalogEntry,
  type StudioCatalogKind,
} from "./StudioCatalog";

export function StudioCatalogSwapPicker(props: {
  kind: StudioCatalogKind;
  currentId: string;
  live: boolean;
  /** The clicked words can be changed in the Words box above. */
  copyEditable: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const choices = studioSwapChoices(props.kind, props.currentId, props.live);
  const current = studioCatalogEntry(props.currentId);
  if (choices.length === 0 || !current)
    return (
      <p className="mb-2 text-sm text-ink-2">
        {props.live || current?.live
          ? "This block has tabs, buttons, links or live details, so it keeps its own look."
          : "No other catalog piece fits this spot, so it keeps its own look."}
        {props.copyEditable ? " You can change its words above." : null}
      </p>
    );
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 text-xs font-semibold text-ink">
        Switch this block to
      </legend>
      <div className="grid max-h-48 gap-1 overflow-y-auto">
        {[current, ...choices].map((entry) => (
          <PieceChoice
            key={entry.id}
            entry={entry}
            now={entry.id === props.currentId}
            selected={entry.id === props.selectedId}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </fieldset>
  );
}

function PieceChoice(props: {
  entry: StudioCatalogEntry;
  now: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm ${
        props.selected
          ? "border-accent bg-accent-soft text-ink"
          : "border-line bg-panel text-ink hover:bg-inset"
      }`}
    >
      <input
        type="radio"
        name="studio-catalog-piece"
        value={props.entry.id}
        checked={props.selected}
        onChange={() => props.onSelect(props.entry.id)}
        className="accent-accent"
      />
      <span className="min-w-0 flex-1 truncate">{props.entry.label}</span>
      {props.now ? (
        <span className="shrink-0 text-xs text-ink-3">Now</span>
      ) : null}
    </label>
  );
}
