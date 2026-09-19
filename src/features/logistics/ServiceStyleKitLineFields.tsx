import { PACK_LIST_UNITS } from "./packListUnits";

export interface KitLineDraft {
  description: string;
  baseQuantity: string;
  guestsPerUnit: string;
  unit: string;
  note: string;
}

export const EMPTY_KIT_LINE_DRAFT: KitLineDraft = {
  description: "",
  baseQuantity: "1",
  guestsPerUnit: "",
  unit: "each",
  note: "",
};

interface ServiceStyleKitLineFieldsProps {
  draft: KitLineDraft;
  disabled: boolean;
  onChange: (patch: Partial<KitLineDraft>) => void;
}

/** The inputs of one kit line: used to add a line and to edit one. */
export function ServiceStyleKitLineFields({
  draft,
  disabled,
  onChange,
}: ServiceStyleKitLineFieldsProps) {
  return (
    <>
      <label className="field-label">
        <span>Item</span>
        <input
          className="input"
          value={draft.description}
          placeholder="e.g. Tent - 10x10 BOH"
          disabled={disabled}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </label>
      <label className="field-label">
        <span>Always send</span>
        <input
          className="input"
          type="number"
          min={0}
          step={1}
          value={draft.baseQuantity}
          disabled={disabled}
          onChange={(e) => onChange({ baseQuantity: e.target.value })}
        />
      </label>
      <label className="field-label">
        <span>Plus 1 per guests (optional)</span>
        <input
          className="input"
          type="number"
          min={1}
          step={1}
          value={draft.guestsPerUnit}
          placeholder="e.g. 25"
          disabled={disabled}
          onChange={(e) => onChange({ guestsPerUnit: e.target.value })}
        />
      </label>
      <label className="field-label">
        <span>Unit</span>
        <select
          className="input"
          value={draft.unit}
          disabled={disabled}
          onChange={(e) => onChange({ unit: e.target.value })}
        >
          {PACK_LIST_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {unit}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label md:col-span-2">
        <span>Packer note (optional)</span>
        <input
          className="input"
          value={draft.note}
          placeholder="e.g. Soft surface needs two tarps"
          disabled={disabled}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      </label>
    </>
  );
}
