import { BuildingIcon } from "../../ui/icons";

export type LayoutSectionRow = {
  readonly id: string;
  readonly type: string;
  readonly instructions: string;
  readonly version: number;
};

type Props = {
  readonly section: LayoutSectionRow;
  readonly disabled: boolean;
  readonly onRename: (next: string) => void;
  readonly onInstructions: (next: string) => void;
  readonly onRemove: () => void;
};

/** One venue area: name (free text, preset-backed) plus setup instructions. */
export function EventLayoutSectionCard({
  section,
  disabled,
  onRename,
  onInstructions,
  onRemove,
}: Props) {
  return (
    <article className="card p-4" data-testid="event-layout-section">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-inset text-ink-2">
          <BuildingIcon />
        </span>
        <label className="field-label min-w-0 flex-1">
          <span>Area name</span>
          <input
            className="input"
            defaultValue={section.type}
            key={`${section.id}:${section.version}:${section.type}`}
            list="battle-board-layout-type-presets"
            disabled={disabled}
            placeholder="Buffet, Main Bar, Patio Bar…"
            onBlur={(blurEvent) => {
              const next = blurEvent.target.value.trim();
              if (!next) {
                // Blank names are rejected by the domain; restore.
                blurEvent.target.value = section.type;
                return;
              }
              if (next === section.type) return;
              onRename(next);
            }}
          />
        </label>
        <button
          type="button"
          className="btn-link text-ink-3"
          disabled={disabled}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>

      <div className="mt-3 rounded-md bg-inset p-3">
        <label className="field-label">
          <span>Setup instructions</span>
          <textarea
            className="input min-h-[5rem] py-2"
            defaultValue={section.instructions}
            key={`${section.id}:${section.version}:${section.instructions}`}
            disabled={disabled}
            placeholder="Setup instructions, equipment, positioning…"
            onBlur={(blurEvent) => {
              const next = blurEvent.target.value;
              if (next === section.instructions) return;
              onInstructions(next);
            }}
          />
        </label>
      </div>
    </article>
  );
}
