import {
  LEFTOVER_HANDLING_LABEL,
  decodeAnswers,
  keptLeftovers,
  type AppetizerStyle,
  type ChecklistAnswer,
  type LeftoverHandling,
  type LeftoverLine,
  type MudaAnswers,
} from "../../../lib/eventPacket/finalLock/fieldFormAnswers";

/** The paper form's lines as tick boxes, grouped under their headings. */
export function ChecklistInput({
  lines,
  onChange,
}: {
  lines: ChecklistAnswer[];
  onChange: (lines: ChecklistAnswer[]) => void;
}) {
  const sections = [...new Set(lines.map((l) => l.section))];
  return (
    <div className="space-y-2" data-testid="field-form-checklist">
      {sections.map((section) => (
        <fieldset key={section}>
          <legend className="font-semibold text-ink">{section}</legend>
          {lines.map((l, i) =>
            l.section === section ? (
              <label key={l.line} className="mt-1 flex items-start gap-2">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={l.done}
                  onChange={(e) =>
                    onChange(
                      lines.map((x, j) =>
                        j === i ? { ...x, done: e.target.checked } : x,
                      ),
                    )
                  }
                />
                <span>{l.line}</span>
              </label>
            ) : null,
          )}
        </fieldset>
      ))}
    </div>
  );
}

const STYLES: { key: AppetizerStyle; label: string }[] = [
  { key: "stationary", label: "Stationary" },
  { key: "passed", label: "Passed" },
  { key: "displays", label: "Displays" },
];

/** Splits the planned menu ("A; B; and 3 more") into names to pick from. */
export function menuNames(expectedItems: string | null) {
  return (expectedItems ?? "")
    .split("; ")
    .map((s) => s.trim())
    .filter((s) => s && !/^and \d+ more$/.test(s));
}

function LeftoverRows({
  kind,
  muda,
  menu,
  onChange,
}: {
  kind: LeftoverLine["kind"];
  muda: MudaAnswers;
  menu: string[];
  onChange: (muda: MudaAnswers) => void;
}) {
  const listId = `muda-menu-${kind}`;
  const rows = muda.leftovers
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.kind === kind);
  const set = (i: number, patch: Partial<LeftoverLine>) =>
    onChange({
      ...muda,
      leftovers: muda.leftovers.map((x, j) =>
        j === i ? { ...x, ...patch } : x,
      ),
    });
  return (
    <div className="space-y-1">
      <datalist id={listId}>
        {menu.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {rows.map(({ l, i }) => (
        <div key={i} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Item</span>
            <input
              className="input block w-full"
              list={listId}
              placeholder="Item"
              value={l.item}
              onChange={(e) => set(i, { item: e.target.value })}
            />
          </label>
          <label className="w-28">
            <span className="sr-only">
              {kind === "appetizer" ? "Servings left" : "Pounds left"}
            </span>
            <input
              className="input block w-full"
              type="number"
              min="0"
              step={kind === "appetizer" ? "1" : "0.1"}
              inputMode="decimal"
              placeholder={kind === "appetizer" ? "Servings" : "Pounds"}
              value={Number.isFinite(l.amount) && l.amount > 0 ? l.amount : ""}
              onChange={(e) => set(i, { amount: Number(e.target.value) })}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              onChange({
                ...muda,
                leftovers: muda.leftovers.filter((_, j) => j !== i),
              })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() =>
          onChange({
            ...muda,
            leftovers: [...muda.leftovers, { item: "", kind, amount: 0 }],
          })
        }
      >
        {kind === "appetizer" ? "Add an appetizer" : "Add a main item"}
      </button>
    </div>
  );
}

/** "Event Food MUDA": attendance, staff-mistake waste and what was left. */
export function MudaInput({
  muda,
  menu,
  onChange,
}: {
  muda: MudaAnswers;
  menu: string[];
  onChange: (muda: MudaAnswers) => void;
}) {
  return (
    <div className="space-y-3" data-testid="field-form-muda">
      <label className="block">
        About how many guests came? (leftover plates and cups help; leave blank
        if you do not know)
        <input
          className="input mt-1 block w-32"
          type="number"
          min="0"
          inputMode="numeric"
          value={muda.attendance ?? ""}
          onChange={(e) =>
            onChange({
              ...muda,
              attendance:
                e.target.value === ""
                  ? null
                  : Math.max(0, Number(e.target.value)),
            })
          }
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={muda.staffError}
          onChange={(e) => onChange({ ...muda, staffError: e.target.checked })}
        />
        Some food was wasted by a staff mistake
      </label>
      {muda.staffError && (
        <label className="block">
          What happened
          <input
            className="input mt-1 block w-full"
            value={muda.staffErrorNote}
            onChange={(e) =>
              onChange({ ...muda, staffErrorNote: e.target.value })
            }
          />
        </label>
      )}
      <fieldset className="space-y-1">
        <legend className="font-semibold text-ink">Appetizers</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={muda.appetizersUsed}
            onChange={(e) =>
              onChange({ ...muda, appetizersUsed: e.target.checked })
            }
          />
          This event had appetizers
        </label>
        {muda.appetizersUsed && (
          <>
            <div className="flex flex-wrap gap-4">
              {STYLES.map((s) => (
                <label key={s.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={muda.appetizerStyles.includes(s.key)}
                    onChange={(e) =>
                      onChange({
                        ...muda,
                        appetizerStyles: e.target.checked
                          ? [...muda.appetizerStyles, s.key]
                          : muda.appetizerStyles.filter((x) => x !== s.key),
                      })
                    }
                  />
                  {s.label}
                </label>
              ))}
            </div>
            <p className="text-ink-2">Each item, then servings left over.</p>
            <LeftoverRows
              kind="appetizer"
              muda={muda}
              menu={menu}
              onChange={onChange}
            />
          </>
        )}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="font-semibold text-ink">Main items</legend>
        <p className="text-ink-2">
          Each item, then pounds left over - food left for the client and food
          brought back to the kitchen.
        </p>
        <LeftoverRows kind="main" muda={muda} menu={menu} onChange={onChange} />
        <div className="flex flex-wrap gap-4">
          {(Object.keys(LEFTOVER_HANDLING_LABEL) as LeftoverHandling[]).map(
            (key) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="muda-mains-handling"
                  checked={muda.mainsHandling === key}
                  onChange={() => onChange({ ...muda, mainsHandling: key })}
                />
                {LEFTOVER_HANDLING_LABEL[key]}
              </label>
            ),
          )}
        </div>
      </fieldset>
    </div>
  );
}

/** A signed form's answers as written: lines not done, or the leftovers. */
export function FieldFormAnswersView({ raw }: { raw: string | null }) {
  const answers = decodeAnswers(raw);
  if (!answers) return null;
  if (answers.kind === "checklist") {
    const missed = answers.lines.filter((l) => !l.done);
    return (
      <div className="mt-1 text-ink-2" data-testid="field-form-answers">
        <p>
          {answers.lines.length - missed.length} of {answers.lines.length} lines
          ticked
        </p>
        {missed.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-danger">
            {missed.map((l) => (
              <li key={`${l.section}-${l.line}`}>
                Not done: {l.section} - {l.line}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const { muda } = answers;
  const left = keptLeftovers(muda);
  return (
    <div className="mt-1 text-ink-2" data-testid="field-form-answers">
      <p>
        {muda.attendance == null
          ? "Attendance not counted"
          : `About ${muda.attendance} guests came`}
        {muda.staffError
          ? ` · Waste from a staff mistake${muda.staffErrorNote ? `: ${muda.staffErrorNote}` : ""}`
          : ""}
      </p>
      {left.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {left.map((l) => (
            <li key={`${l.kind}-${l.item}`}>
              {l.item}: {l.amount} {l.kind === "appetizer" ? "servings" : "lb"}{" "}
              left
            </li>
          ))}
        </ul>
      )}
      {muda.mainsHandling && (
        <p className="mt-1">
          Main items:{" "}
          {LEFTOVER_HANDLING_LABEL[muda.mainsHandling].toLowerCase()}
        </p>
      )}
    </div>
  );
}
