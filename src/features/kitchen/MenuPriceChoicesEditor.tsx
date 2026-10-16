import type { MenuPriceChoice } from "../../lib/menuPricing";

export type MenuChoiceDish = { dishId: string; name: string; course: string };

export type ChoiceRow = {
  label: string;
  price: string;
  when: "hand" | "picks" | "dishes";
  course: string;
  picks: string;
  dishIds: string[];
};

export const choiceRowsFrom = (choices: MenuPriceChoice[]): ChoiceRow[] =>
  choices.map((choice) => ({
    label: choice.label,
    price: String(choice.pricePerPerson),
    when: choice.dishIds?.length
      ? "dishes"
      : choice.picks != null
        ? "picks"
        : "hand",
    course: choice.course ?? "",
    picks: choice.picks != null ? String(choice.picks) : "",
    dishIds: choice.dishIds ?? [],
  }));

/** The rows as stored choices, or a message for the first incomplete row. */
export function choicesFromRows(rows: ChoiceRow[]): MenuPriceChoice[] | string {
  const out: MenuPriceChoice[] = [];
  for (const row of rows) {
    const label = row.label.trim();
    const price = Number(row.price);
    if (!label && !row.price.trim()) continue;
    if (!label || !(price > 0))
      return "Give each price choice a name and a price per guest above 0.";
    const choice: MenuPriceChoice = { label, pricePerPerson: price };
    if (row.when === "picks") {
      const picks = Math.round(Number(row.picks));
      if (!row.course || !(picks > 0))
        return `"${label}": pick the course and how many dishes are picked from it.`;
      choice.course = row.course;
      choice.picks = picks;
    }
    if (row.when === "dishes") {
      if (row.dishIds.length === 0)
        return `"${label}": tick the dishes that call for this price.`;
      choice.dishIds = row.dishIds;
    }
    out.push(choice);
  }
  return out;
}

const emptyRow = (): ChoiceRow => ({
  label: "",
  price: "",
  when: "hand",
  course: "",
  picks: "",
  dishIds: [],
});

/**
 * Price choices, one row each. A choice is picked by hand on the proposal, or
 * applies by itself when a number of dishes is picked from a course, or when
 * one of its dishes is picked (the highest such choice wins).
 */
export function MenuPriceChoicesEditor({
  rows,
  onChange,
  courses,
  dishes,
  disabled,
}: Readonly<{
  rows: ChoiceRow[];
  onChange: (rows: ChoiceRow[]) => void;
  courses: string[];
  dishes: MenuChoiceDish[];
  disabled: boolean;
}>) {
  const update = (index: number, change: Partial<ChoiceRow>) =>
    onChange(
      rows.map((row, at) => (at === index ? { ...row, ...change } : row)),
    );

  return (
    <fieldset className="grid gap-3 sm:col-span-2" disabled={disabled}>
      <legend className="field-label">
        <span>Price choices</span>
      </legend>
      {rows.map((row, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-sm border border-line p-3 sm:grid-cols-[1fr_8rem_12rem_auto]"
        >
          <label className="field-label">
            <span>Name</span>
            <input
              className="input"
              value={row.label}
              placeholder="Full portions of both"
              onChange={(e) => update(index, { label: e.target.value })}
            />
          </label>
          <label className="field-label">
            <span>Per guest ($)</span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={row.price}
              onChange={(e) => update(index, { price: e.target.value })}
            />
          </label>
          <label className="field-label">
            <span>Applies</span>
            <select
              className="input"
              value={row.when}
              onChange={(e) =>
                update(index, { when: e.target.value as ChoiceRow["when"] })
              }
            >
              <option value="hand">When staff pick it</option>
              <option value="picks">By number of dishes picked</option>
              <option value="dishes">When one of its dishes is picked</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm self-end"
            onClick={() => onChange(rows.filter((_, at) => at !== index))}
          >
            Remove
          </button>
          {row.when === "picks" ? (
            <div className="grid gap-2 sm:col-span-4 sm:grid-cols-2">
              <label className="field-label">
                <span>Course</span>
                <select
                  className="input"
                  value={row.course}
                  onChange={(e) => update(index, { course: e.target.value })}
                >
                  <option value="">Pick a course</option>
                  {courses.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                <span>Dishes picked from it</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step={1}
                  value={row.picks}
                  onChange={(e) => update(index, { picks: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          {row.when === "dishes" ? (
            <div className="sm:col-span-4">
              <p className="text-xs text-ink-3">
                Picking any of these dishes calls for this price. With several
                choices, the highest price wins.
              </p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {dishes.map((dish) => (
                  <label
                    key={dish.dishId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={row.dishIds.includes(dish.dishId)}
                      onChange={(e) =>
                        update(index, {
                          dishIds: e.target.checked
                            ? [...row.dishIds, dish.dishId]
                            : row.dishIds.filter((id) => id !== dish.dishId),
                        })
                      }
                    />
                    {dish.name}
                    {dish.course ? (
                      <span className="text-ink-3">· {dish.course}</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}
      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onChange([...rows, emptyRow()])}
        >
          Add a price choice
        </button>
      </div>
    </fieldset>
  );
}
