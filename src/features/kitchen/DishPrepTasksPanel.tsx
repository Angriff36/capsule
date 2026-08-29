import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateDishTask,
  useDishTaskRetire,
  useListDishTask,
  useListComponent,
} from "../../lib/manifest-convex-react";
import { componentPath } from "./kitchenRoutes";
import { TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { useActionNotice, useActionFailure } from "../../ui/action-result";
import {
  PrepTemplateQuantityCoordinator,
  type PrepQuantityEntryMode,
} from "./PrepTemplateQuantityCoordinator";
import { prepQuantityLabel } from "./prepQuantityLabel";

type Props = {
  dishId: string;
};

// The exact Category values printed on the real prep sheets, transcribed from
// the photographs into work/prep-lists-from-photos.csv. Kept as the sheet
// spells them so a printed list reads the same as the one the kitchen knows.
const CATEGORIES = [
  { value: "Finish at Event", label: "Finish at Event" },
  { value: "Finish at Kitchen", label: "Finish at Kitchen" },
  { value: "Drop Off", label: "Drop Off" },
  { value: "Drop Off Items", label: "Drop Off Items" },
  { value: "Bev - Non Alcohol", label: "Bev - Non Alcohol" },
  { value: "Side Items", label: "Side Items" },
] as const;

// Ordered so the units the sheets actually use most come first. "melon" stays
// in the domain vocabulary for imported prep sheets but is not offered here —
// it reads as leaked test data in a picker.
const UNITS = [
  "each",
  "serving",
  "portion",
  "pound",
  "ounce",
  "gram",
  "kilogram",
  "quart",
  "pint",
  "cup",
  "gallon",
  "liter",
  "milliliter",
  "tablespoon",
  "teaspoon",
  "batch",
  "bottle",
] as const;

const QUANTITY_MODES: { value: PrepQuantityEntryMode; label: string }[] = [
  { value: "per_guest", label: "Per guest" },
  { value: "batch_total", label: "Total for batch" },
];

function templateQuantityMeta(
  quantity: number | undefined | null,
  unit: string | undefined | null,
) {
  if (quantity == null || quantity <= 0) return null;
  const unitLabel = String(unit ?? "");
  return `${prepQuantityLabel(quantity, unitLabel)} ${unitLabel}/guest`;
}

/** Dish-level prep task templates with component hyperlinks when linked. */
export function DishPrepTasksPanel({ dishId }: Props) {
  const tasks = useListDishTask();
  const components = useListComponent();
  const addTask = useCreateDishTask();
  const retireTask = useDishTaskRetire();

  const [busy, setBusy] = useState<string | null>(null);
  const { error, setError } = useActionFailure();
  const { notice, setNotice } = useActionNotice();
  // A dish's tasks come off one sheet, so they share a category and mostly
  // share a unit — those two hold their last value instead of resetting.
  // Station is free text and clears with the rest of the form: a stale
  // station silently mislabels the next row (issue #151 item 11).
  // Fully controlled — never call form.reset(); native reset fights React
  // state on category/unit and silently snaps selects back to defaults.
  const [taskName, setTaskName] = useState("");
  const [category, setCategory] = useState("Finish at Event");
  const [station, setStation] = useState("");
  const [quantityMode, setQuantityMode] =
    useState<PrepQuantityEntryMode>("batch_total");
  const [perGuestQty, setPerGuestQty] = useState("");
  const [batchTotalQty, setBatchTotalQty] = useState("");
  const [batchServings, setBatchServings] = useState("");
  const [unit, setUnit] = useState("each");
  const [instructions, setInstructions] = useState("");
  const { prompt, host: promptHost } = useActionPrompt();

  const rows = (tasks ?? [])
    .filter(
      (task) =>
        task.deletedAt == null &&
        task.dishId === dishId &&
        task.status === "active",
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  function clearAddFields() {
    setTaskName("");
    setStation("");
    setPerGuestQty("");
    setBatchTotalQty("");
    setInstructions("");
    // category, unit, quantityMode, batchServings hold for the next row.
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = taskName.trim();
    if (!name) {
      setError("A task name is required.");
      return;
    }

    const qtyCommit = PrepTemplateQuantityCoordinator.commit(
      quantityMode,
      perGuestQty,
      batchTotalQty,
      batchServings,
    );
    const wantsQuantity =
      quantityMode === "per_guest"
        ? perGuestQty.trim() !== "" && Number(perGuestQty.trim()) !== 0
        : batchTotalQty.trim() !== "" || batchServings.trim() !== "";

    if (wantsQuantity && !qtyCommit.ok) {
      setError(qtyCommit.error);
      return;
    }

    const perGuest = qtyCommit.ok ? qtyCommit.perGuest : null;

    setBusy("add");
    setError(null);
    setNotice(null);
    try {
      await addTask({
        dishId,
        name,
        category,
        station: station.trim() || undefined,
        defaultQuantity: perGuest ?? undefined,
        defaultUnit: perGuest != null ? unit : undefined,
        instructions: instructions.trim() || undefined,
        sortOrder: rows.length,
      });
      clearAddFields();
      setNotice(
        "Template added. Every event this dish is added to now opens this prep task.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the template.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onRetire(
    id: string,
    version: number | undefined,
    name: string,
  ) {
    const ok = await prompt.askConfirm({
      title: "Retire prep template",
      description: `Retire "${name}"? New events using this dish will no longer open this prep task.`,
      confirmLabel: "Retire",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await retireTask({ docId: id, version, reason: "Removed from dish" });
      setNotice("Template retired — it will not generate prep tasks again.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not retire the template.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Prep task templates</h2>
        <span>{formatCountNoun(rows.length, "task")}</span>
      </div>

      {promptHost}
      {error ? <p className="text-base text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-base text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {tasks === undefined ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>
            No prep templates on this dish yet. Event prep is generated from
            these when a dish is added to an event.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((task) => {
            const component = task.componentId
              ? components?.find((entry) => entry._id === task.componentId)
              : null;
            const qtyMeta = templateQuantityMeta(
              task.defaultQuantity,
              task.defaultUnit,
            );
            return (
              <li
                key={task._id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                data-testid="dish-prep-template-row"
              >
                <div>
                  <p className="text-lg font-medium text-ink">{task.name}</p>
                  <p className="font-mono text-xs text-ink-3">
                    {task.category} · {task.taskType}
                    {task.station ? ` · ${task.station}` : ""}
                    {qtyMeta ? ` · ${qtyMeta}` : ""}
                  </p>
                  {task.instructions ? (
                    <p className="mt-1 text-sm text-ink-2">
                      <span className="font-medium text-ink-3">Notes: </span>
                      {task.instructions}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  {component ? (
                    <Link
                      to={componentPath(component._id)}
                      className="text-base text-accent underline-offset-2 hover:underline"
                    >
                      Component: {component.name}
                    </Link>
                  ) : task.componentId ? (
                    <span className="text-sm text-ink-3">Component linked</span>
                  ) : (
                    <span className="text-sm text-ink-3">No component</span>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy != null}
                    onClick={() =>
                      void onRetire(task._id, task.version, task.name)
                    }
                  >
                    {busy === task._id ? "Working…" : "Remove"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onAdd}>
        <label className="block text-sm sm:col-span-2">
          <span className="meta-term">Task</span>
          <input
            name="name"
            className="input mt-1"
            placeholder="BRINE AIRLINE CHICKEN"
            required
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="meta-term">Category</span>
          <select
            className="input mt-1"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="meta-term">Station</span>
          <input
            name="station"
            className="input mt-1"
            placeholder="Apps - Passed - Finish at Event"
            value={station}
            onChange={(event) => setStation(event.target.value)}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="meta-term">Quantity mode</span>
          <select
            className="input mt-1"
            value={quantityMode}
            onChange={(event) =>
              setQuantityMode(event.target.value as PrepQuantityEntryMode)
            }
          >
            {QUANTITY_MODES.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        {quantityMode === "per_guest" ? (
          <label className="block text-sm">
            <span className="meta-term">Per guest (0 = one each)</span>
            <input
              name="defaultQuantity"
              type="text"
              inputMode="decimal"
              placeholder="0.0313"
              value={perGuestQty}
              onChange={(event) => setPerGuestQty(event.target.value)}
              className="input mt-1"
            />
          </label>
        ) : (
          <>
            <label className="block text-sm">
              <span className="meta-term">Total for batch</span>
              <input
                name="batchTotal"
                type="text"
                inputMode="decimal"
                placeholder="97.50"
                value={batchTotalQty}
                onChange={(event) => setBatchTotalQty(event.target.value)}
                className="input mt-1"
              />
            </label>
            <label className="block text-sm">
              <span className="meta-term">Servings on sheet</span>
              <input
                name="batchServings"
                type="text"
                inputMode="numeric"
                placeholder="260"
                value={batchServings}
                onChange={(event) => setBatchServings(event.target.value)}
                className="input mt-1"
              />
            </label>
          </>
        )}
        <label className="block text-sm">
          <span className="meta-term">Unit</span>
          <select
            className="input mt-1"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="meta-term">Notes</span>
          <input
            name="instructions"
            className="input mt-1"
            placeholder="Weight after cooked"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy != null}
          >
            {busy === "add" ? "Adding…" : "Add prep template"}
          </button>
        </div>
      </form>
    </section>
  );
}
