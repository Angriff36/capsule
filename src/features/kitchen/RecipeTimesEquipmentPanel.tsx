import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useComponentEquipmentRemove,
  useComponentSetTimes,
  useCreateComponentEquipment,
  useListComponentEquipment,
  useListEquipment,
} from "../../lib/manifest-convex-react";
import {
  activeRecipeEquipment,
  type RecipeEquipmentOption,
} from "./recipeEquipment";
import { formatMinutes } from "./stylePackaging";

export type RecipeTimesRow = {
  _id: string;
  version: number;
  activePrepMinutes?: number | null;
  passiveCookMinutes?: number | null;
};

export type ComponentEquipmentRow = {
  _id: string;
  version: number;
  componentId: string;
  name: string;
  sortOrder?: number | null;
  addedAt?: number | null;
  deletedAt?: number | null;
};

/** One recipe's equipment list, in the order it was written. */
export function recipeEquipmentList(
  rows: readonly ComponentEquipmentRow[] | undefined,
  componentId: string,
) {
  return (rows ?? [])
    .filter((row) => row.componentId === componentId && row.deletedAt == null)
    .sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        (a.addedAt ?? 0) - (b.addedAt ?? 0),
    );
}

/** Hands-on, unattended and total time, or null when none is on file. */
export function recipeTimes(row: RecipeTimesRow) {
  const active = row.activePrepMinutes ?? null;
  const passive = row.passiveCookMinutes ?? null;
  if (active == null && passive == null) return null;
  return {
    active: formatMinutes(active ?? 0),
    passive: formatMinutes(passive ?? 0),
    total: formatMinutes((active ?? 0) + (passive ?? 0)),
  };
}

/**
 * The top of the recipe sheet: how long it takes (hands-on, unattended,
 * total) and the equipment the cook pulls before starting.
 */
export function RecipeTimesEquipmentPanel({
  component,
  onFailure,
}: {
  component: RecipeTimesRow;
  onFailure: (error: unknown) => void;
}) {
  const setTimes = useComponentSetTimes();
  const addEquipment = useCreateComponentEquipment();
  const removeEquipment = useComponentEquipmentRemove();
  const rows = useListComponentEquipment() as
    ComponentEquipmentRow[] | undefined;
  const companyEquipment = useListEquipment() as
    RecipeEquipmentOption[] | undefined;
  const [busy, setBusy] = useState<string | null>(null);
  const times = recipeTimes(component);
  const list = recipeEquipmentList(rows, component._id);

  const run = (key: string, work: () => Promise<unknown>) =>
    (async () => {
      onFailure(null);
      setBusy(key);
      try {
        await work();
        return true;
      } catch (error) {
        onFailure(error);
        return false;
      } finally {
        setBusy(null);
      }
    })();

  const saveTimes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const minutes = (name: string) => {
      const value = Number(String(data.get(name) ?? "").trim() || 0);
      return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
    };
    void run("times", () =>
      setTimes({
        docId: component._id,
        version: component.version,
        activePrepMinutes: minutes("activePrepMinutes"),
        passiveCookMinutes: minutes("passiveCookMinutes"),
      }),
    );
  };

  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    const last = list[list.length - 1];
    void run("add", () =>
      addEquipment({
        componentId: component._id,
        name,
        sortOrder: (last?.sortOrder ?? list.length) + 1,
      }),
    ).then((ok) => {
      if (ok) form.reset();
    });
  };

  const onList = activeRecipeEquipment(companyEquipment);
  const squash = (text: string) =>
    text.trim().replace(/\s+/g, " ").toLowerCase();

  return (
    <section
      className="culinary-section"
      aria-label="Times and equipment"
      data-testid="recipe-times-equipment"
    >
      <div className="culinary-section-heading">
        <h2>Times and equipment</h2>
        <span>{times ? `Total ${times.total}` : "Times not on file"}</span>
      </div>
      {times ? (
        <dl className="culinary-facts">
          <div>
            <dt>Hands-on prep</dt>
            <dd>{times.active}</dd>
          </div>
          <div>
            <dt>Unattended cooking</dt>
            <dd>{times.passive}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{times.total}</dd>
          </div>
        </dl>
      ) : null}
      <details className="recipe-add-editor">
        <summary>{times ? "Edit times" : "Add times"}</summary>
        <form
          key={`times:${component._id}:${component.version}`}
          className="culinary-line-form"
          onSubmit={saveTimes}
        >
          <label className="field-label">
            Hands-on prep (minutes)
            <input
              name="activePrepMinutes"
              type="number"
              min={0}
              step={1}
              className="input"
              defaultValue={component.activePrepMinutes ?? ""}
            />
          </label>
          <label className="field-label">
            Unattended cooking (minutes)
            <input
              name="passiveCookMinutes"
              type="number"
              min={0}
              step={1}
              className="input"
              defaultValue={component.passiveCookMinutes ?? ""}
            />
          </label>
          <button className="btn btn-primary self-end" disabled={busy != null}>
            {busy === "times" ? "Saving…" : "Save times"}
          </button>
        </form>
      </details>

      <p className="text-sm font-semibold text-ink">
        Equipment{list.length > 0 ? ` (${list.length})` : ""}
      </p>
      {rows === undefined ? null : list.length === 0 ? (
        <p className="text-base text-ink-3">Not on file</p>
      ) : (
        <ul className="m-0 list-none space-y-1 p-0">
          {list.map((row) => {
            const item =
              onList.find((piece) => squash(piece.name) === squash(row.name)) ??
              null;
            return (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  {item ? (
                    <>
                      <Link to="/facilities/equipment">{row.name}</Link>
                      <span className="text-ink-3">
                        {" "}
                        · {item.quantity ?? 0}{" "}
                        {item.countUnit?.trim() || "each"} on hand
                      </span>
                    </>
                  ) : (
                    row.name
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() =>
                    void run(row._id, () =>
                      removeEquipment({ docId: row._id, version: row.version }),
                    )
                  }
                >
                  {busy === row._id ? "Removing…" : "Remove"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="culinary-line-form" onSubmit={add}>
        <label className="field-label sm:col-span-2">
          Add equipment
          <input
            name="name"
            className="input"
            list={`recipe-equipment-${component._id}`}
            placeholder="Tilt skillet, immersion blender"
            required
          />
          <datalist id={`recipe-equipment-${component._id}`}>
            {onList.map((item) => (
              <option key={item._id} value={item.name} />
            ))}
          </datalist>
        </label>
        <button className="btn btn-primary self-end" disabled={busy != null}>
          {busy === "add" ? "Adding…" : "Add"}
        </button>
      </form>
    </section>
  );
}
