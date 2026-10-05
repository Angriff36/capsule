import { useState, type FormEvent } from "react";
import {
  parseTemplateLines,
  type StaffingTemplateLine,
} from "../../lib/staffingTemplates";

export type StaffingTemplateDraft = {
  name: string;
  serviceStyleId?: string;
  minGuests?: number;
  maxGuests?: number;
  lines: string;
};

type LineText = Record<keyof StaffingTemplateLine, string>;
const EMPTY_LINE: LineText = {
  role: "",
  fixedCount: "",
  guestsPerWorker: "",
  minCount: "",
  qualificationName: "",
  certificationType: "",
  skills: "",
  uniform: "",
  workLocation: "",
  payBasis: "",
  budgetHourlyRate: "",
};

const toText = (line: StaffingTemplateLine): LineText =>
  Object.fromEntries(
    Object.keys(EMPTY_LINE).map((key) => [
      key,
      String(line[key as keyof StaffingTemplateLine] ?? ""),
    ]),
  ) as LineText;

const number = (value: string) =>
  value.trim() === "" ? undefined : Number(value);

/** Form for one crew template: name, style, guest range and its roles. */
export function StaffingTemplateForm({
  initial,
  styles,
  busy,
  onSave,
  onCancel,
}: {
  initial?: StaffingTemplateDraft;
  styles: readonly { _id: string; name: string }[];
  busy: boolean;
  onSave: (draft: StaffingTemplateDraft) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [styleId, setStyleId] = useState(initial?.serviceStyleId ?? "");
  const [minGuests, setMinGuests] = useState(
    initial?.minGuests != null ? String(initial.minGuests) : "",
  );
  const [maxGuests, setMaxGuests] = useState(
    initial?.maxGuests != null ? String(initial.maxGuests) : "",
  );
  const [lines, setLines] = useState<LineText[]>(() => {
    const parsed = initial ? parseTemplateLines(initial.lines) : [];
    return parsed.length ? parsed.map(toText) : [{ ...EMPTY_LINE }];
  });
  const [problem, setProblem] = useState<string | null>(null);

  const setLine = (index: number, key: keyof LineText, value: string) =>
    setLines((rows) =>
      rows.map((row, at) => (at === index ? { ...row, [key]: value } : row)),
    );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseTemplateLines(
      JSON.stringify(
        lines.map((row) => ({
          ...row,
          fixedCount: number(row.fixedCount),
          guestsPerWorker: number(row.guestsPerWorker),
          minCount: number(row.minCount),
          budgetHourlyRate: number(row.budgetHourlyRate),
        })),
      ),
    );
    if (!name.trim()) return setProblem("Give this crew template a name.");
    if (parsed.length === 0) return setProblem("Add at least one role.");
    setProblem(null);
    onSave({
      name: name.trim(),
      serviceStyleId: styleId || undefined,
      minGuests: number(minGuests),
      maxGuests: number(maxGuests),
      lines: JSON.stringify(parsed),
    });
  };

  const cell = (
    index: number,
    key: keyof LineText,
    label: string,
    width = "w-24",
  ) => (
    <label className="field-label">
      <span className="text-xs text-ink-3">{label}</span>
      <input
        className={`field-input ${width}`}
        value={lines[index]![key]}
        onChange={(event) => setLine(index, key, event.target.value)}
      />
    </label>
  );

  return (
    <form
      className="space-y-3"
      onSubmit={submit}
      data-testid="staffing-template-form"
    >
      <div className="flex flex-wrap gap-3">
        <label className="field-label">
          Name
          <input
            className="field-input w-56"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field-label">
          Service style
          <select
            className="field-input w-44"
            value={styleId}
            onChange={(e) => setStyleId(e.target.value)}
          >
            <option value="">Any style</option>
            {styles.map((style) => (
              <option key={style._id} value={style._id}>
                {style.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Fewest guests
          <input
            className="field-input w-24"
            inputMode="numeric"
            value={minGuests}
            onChange={(e) => setMinGuests(e.target.value)}
          />
        </label>
        <label className="field-label">
          Most guests
          <input
            className="field-input w-24"
            inputMode="numeric"
            value={maxGuests}
            onChange={(e) => setMaxGuests(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm text-ink-3">
        For each role: a fixed number, one person per so many guests, or both.
        "At least" sets a floor.
      </p>
      {lines.map((_, index) => (
        <fieldset
          key={index}
          className="flex flex-wrap items-end gap-2 border-t border-line pt-2"
        >
          {cell(index, "role", "Role", "w-36")}
          {cell(index, "fixedCount", "Fixed")}
          {cell(index, "guestsPerWorker", "1 per guests")}
          {cell(index, "minCount", "At least")}
          {cell(index, "qualificationName", "Certificate", "w-36")}
          {cell(index, "uniform", "What to wear", "w-36")}
          {cell(index, "workLocation", "Where", "w-28")}
          {cell(index, "skills", "Skills", "w-28")}
          <label className="field-label">
            <span className="text-xs text-ink-3">Pay</span>
            <select
              className="field-input w-28"
              value={lines[index]!.payBasis}
              onChange={(event) =>
                setLine(index, "payBasis", event.target.value)
              }
            >
              <option value="">Not set</option>
              <option value="hourly">Hourly</option>
              <option value="flat_rate">Flat rate</option>
            </select>
          </label>
          {cell(index, "budgetHourlyRate", "Budget $/hr")}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              setLines((rows) => rows.filter((__, at) => at !== index))
            }
            disabled={lines.length === 1}
          >
            Remove
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setLines((rows) => [...rows, { ...EMPTY_LINE }])}
      >
        Add role
      </button>
      {problem ? (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" disabled={busy}>
          Save crew template
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
