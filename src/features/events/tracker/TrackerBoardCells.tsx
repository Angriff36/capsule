import { useState, type FormEvent } from "react";

/** A small labelled tag in a tracker cell; red when it is double-booked. */
export function Chip({
  label,
  tone,
  warn,
  title,
  onRemove,
  removeLabel,
}: {
  label: string;
  tone: "neutral" | "people" | "decor";
  warn?: boolean;
  title?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      className="trk-chip"
      data-tone={tone}
      data-warn={warn || undefined}
      title={title}
    >
      {warn ? <span aria-hidden="true">⚠</span> : null}
      {label}
      {onRemove ? (
        <button
          type="button"
          className="trk-chip-x"
          aria-label={removeLabel ?? `Remove ${label}`}
          onClick={onRemove}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export interface EquipmentHoldChip {
  id: string;
  version: number;
  equipmentId: string;
  name: string;
  quantity: number;
  /** Still only reserved (not checked out): it can be taken off. */
  removable: boolean;
  warn: string | null;
  overbooked: boolean;
}

/** The Equipment cell: what is held for the event, and a picker to add. */
export function EquipmentCell({
  eventTitle,
  holds,
  options,
  canEdit,
  busy,
  onAdd,
  onRemove,
  addLabel = "Equipment",
  tone = "neutral",
}: {
  addLabel?: string;
  tone?: "neutral" | "decor";
  eventTitle: string;
  holds: EquipmentHoldChip[];
  options: { id: string; label: string }[];
  canEdit: boolean;
  busy: boolean;
  onAdd: (equipmentId: string, quantity: number) => void;
  onRemove: (hold: EquipmentHoldChip) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [amount, setAmount] = useState("1");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!pick) return;
    onAdd(pick, Math.max(1, Math.round(Number(amount) || 1)));
    setPick("");
    setAmount("1");
    setOpen(false);
  };
  return (
    <div className="trk-chips">
      {holds.map((hold) => (
        <Chip
          key={hold.id}
          tone={tone}
          label={`${hold.name} ×${hold.quantity}`}
          warn={hold.warn != null}
          title={
            hold.warn ??
            (hold.overbooked
              ? "Booked over a double-booking warning"
              : undefined)
          }
          onRemove={
            canEdit && hold.removable && !busy
              ? () => onRemove(hold)
              : undefined
          }
          removeLabel={`Take ${hold.name} off ${eventTitle}`}
        />
      ))}
      {holds.length === 0 && !canEdit ? (
        <span className="trk-none">None</span>
      ) : null}
      {canEdit && !open ? (
        <button
          type="button"
          className="trk-add"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          + {addLabel}
        </button>
      ) : null}
      {canEdit && open ? (
        <form className="trk-inline-form" onSubmit={submit}>
          <select
            className="input"
            aria-label={`${addLabel} for ${eventTitle}`}
            value={pick}
            onChange={(event) => setPick(event.currentTarget.value)}
            autoFocus
          >
            <option value="">Pick an item</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <input
            className="input trk-num"
            type="number"
            min={1}
            aria-label="How many"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!pick}
          >
            Add
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </div>
  );
}

/** Split a kit or list answer into its items. */
export function listItems(text: string): string[] {
  return text
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A text cell shown as chips or prose, edited in place. */
export function EditableTextCell({
  label,
  value,
  canEdit,
  busy,
  asChips,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  busy: boolean;
  asChips: boolean;
  placeholder: string;
  onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing && canEdit)
    return (
      <textarea
        className="input trk-text-edit"
        aria-label={label}
        defaultValue={value}
        placeholder={placeholder}
        rows={3}
        autoFocus
        onBlur={(event) => {
          setEditing(false);
          const next = event.currentTarget.value.trim();
          if (next !== value) onSave(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(false);
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey))
            event.currentTarget.blur();
        }}
      />
    );
  const items = asChips ? listItems(value) : [];
  return (
    <button
      type="button"
      className="trk-text"
      disabled={!canEdit || busy}
      aria-label={canEdit ? `Edit ${label}` : label}
      onClick={() => setEditing(true)}
    >
      {value === "" ? (
        <span className="trk-none">
          {canEdit ? `+ ${placeholder}` : "None"}
        </span>
      ) : asChips ? (
        <span className="trk-chips">
          {items.map((item, index) => (
            <Chip key={`${item}:${index}`} tone="decor" label={item} />
          ))}
        </span>
      ) : (
        <span className="trk-note">{value}</span>
      )}
    </button>
  );
}
