import { useMemo, useState, type FormEvent } from "react";
import {
  useCreateEventDishLineOverride,
  useEventDishLineOverrideRevoke,
  useListComponent,
  useListDishComponent,
  useListDishIngredient,
  useListEventDishLineOverride,
  useListIngredient,
} from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";
import { SELECTABLE_UNITS } from "../kitchen/import/UnitOfMeasureMapper";

/**
 * Recipe changes for THIS event only — "no onions on this one", "swap the
 * cream sauce for oil and vinegar for 2 portions". The master Dish is never
 * touched; the demand engine applies these overrides when it costs and
 * orders. Remove, replace and adjust need the recipe line they act on; add
 * and replace need the ingredient or sub-recipe they bring in.
 */
const OVERRIDE_KINDS = ["add", "remove", "replace", "adjust"] as const;
type OverrideKind = (typeof OVERRIDE_KINDS)[number];

const KIND_LABELS: Record<OverrideKind, string> = {
  add: "Add",
  remove: "Remove",
  replace: "Replace",
  adjust: "Adjust",
};

function needsTarget(kind: OverrideKind): boolean {
  return kind !== "add";
}

function needsSource(kind: OverrideKind): boolean {
  return kind === "add" || kind === "replace";
}

type Choice = { readonly value: string; readonly label: string };

export function EventMenuLineOverrides({
  eventId,
  eventDishId,
  dishId,
  dishName,
  busy,
  prompt,
  onFailure,
}: {
  eventId: string;
  eventDishId: string;
  dishId: string;
  dishName: string;
  busy: boolean;
  prompt: ActionPromptSession;
  onFailure: (error: unknown) => void;
}) {
  const overrides = useListEventDishLineOverride();
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const ingredients = useListIngredient();
  const components = useListComponent();
  const applyOverride = useCreateEventDishLineOverride();
  const revokeOverride = useEventDishLineOverrideRevoke();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OverrideKind>("remove");
  const [working, setWorking] = useState(false);

  const ingredientName = (id: string | null | undefined) =>
    (ingredients ?? []).find((row) => row._id === id)?.name ?? "Ingredient";
  const componentName = (id: string | null | undefined) =>
    (components ?? []).find((row) => row._id === id)?.name ?? "Sub-recipe";

  const lines = useMemo(
    () =>
      (overrides ?? []).filter(
        (row) => row.deletedAt == null && row.eventDishId === eventDishId,
      ),
    [eventDishId, overrides],
  );

  const targetChoices: Choice[] = useMemo(() => {
    const fromIngredients = (dishIngredients ?? [])
      .filter((row) => row.deletedAt == null && row.dishId === dishId)
      .map((row) => ({
        value: `ingredient:${row._id}`,
        label: `${ingredientName(row.ingredientId)} (recipe line)`,
      }));
    const fromComponents = (dishComponents ?? [])
      .filter((row) => row.deletedAt == null && row.dishId === dishId)
      .map((row) => ({
        value: `component:${row._id}`,
        label: `${componentName(row.componentId)} (sub-recipe)`,
      }));
    return [...fromIngredients, ...fromComponents];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, dishComponents, dishId, dishIngredients, ingredients]);

  const sourceChoices: Choice[] = useMemo(() => {
    const catalogIngredients = (ingredients ?? [])
      .filter((row) => row.deletedAt == null)
      .map((row) => ({
        value: `ingredient:${row._id}`,
        label: String(row.name),
      }));
    const catalogComponents = (components ?? [])
      .filter((row) => row.deletedAt == null)
      .map((row) => ({
        value: `component:${row._id}`,
        label: `${String(row.name)} (sub-recipe)`,
      }));
    return [...catalogIngredients, ...catalogComponents];
  }, [components, ingredients]);

  const describe = (row: (typeof lines)[number]) => {
    const target =
      row.targetDishIngredientId != null
        ? ingredientName(
            (dishIngredients ?? []).find(
              (line) => line._id === row.targetDishIngredientId,
            )?.ingredientId,
          )
        : row.targetDishComponentId != null
          ? componentName(
              (dishComponents ?? []).find(
                (line) => line._id === row.targetDishComponentId,
              )?.componentId,
            )
          : null;
    const source =
      row.ingredientId != null
        ? ingredientName(row.ingredientId)
        : row.componentId != null
          ? componentName(row.componentId)
          : null;
    const subject =
      row.kind === "replace" && target && source
        ? `${target} → ${source}`
        : (source ?? target ?? "recipe line");
    const amount =
      row.quantity != null
        ? ` · ${Number(row.quantity)} ${row.unit ?? ""}`
        : "";
    return `${KIND_LABELS[row.kind as OverrideKind] ?? row.kind} ${subject}${amount} · ${Number(row.portionsAffected)} portion${Number(row.portionsAffected) === 1 ? "" : "s"}`;
  };

  const submit = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    const data = new FormData(formEvent.currentTarget);
    const target = String(data.get("target") ?? "");
    const source = String(data.get("source") ?? "");
    const quantity = String(data.get("quantity") ?? "").trim();
    const unit = String(data.get("unit") ?? "").trim();
    const portions = Number(data.get("portionsAffected") ?? 0);
    const reason = String(data.get("reason") ?? "").trim();
    if (!Number.isFinite(portions) || portions < 0 || reason === "") return;
    const form = formEvent.currentTarget;
    void (async () => {
      setWorking(true);
      try {
        await applyOverride({
          eventDishId,
          eventId,
          kind,
          portionsAffected: portions,
          reason,
          targetDishIngredientId: target.startsWith("ingredient:")
            ? target.slice("ingredient:".length)
            : undefined,
          targetDishComponentId: target.startsWith("component:")
            ? target.slice("component:".length)
            : undefined,
          ingredientId: source.startsWith("ingredient:")
            ? source.slice("ingredient:".length)
            : undefined,
          componentId: source.startsWith("component:")
            ? source.slice("component:".length)
            : undefined,
          quantity: quantity === "" ? undefined : Number(quantity),
          unit: unit === "" ? undefined : unit,
        });
        form.reset();
        setOpen(false);
      } catch (error) {
        onFailure(error);
      } finally {
        setWorking(false);
      }
    })();
  };

  const revoke = (row: (typeof lines)[number]) => {
    void (async () => {
      const reason = await prompt.askReason({
        title: "Revoke this recipe change",
        description: `${describe(row)} on ${dishName}. The line goes back to the catalog recipe for this event.`,
        label: "Reason",
        placeholder: "e.g. Guest withdrew the request",
        confirmLabel: "Revoke change",
        tone: "danger",
      });
      if (!reason) return;
      setWorking(true);
      try {
        await revokeOverride({
          docId: row._id,
          version: row.version,
          reason,
        });
      } catch (error) {
        onFailure(error);
      } finally {
        setWorking(false);
      }
    })();
  };

  const disabled = busy || working;

  return (
    <div className="mt-1" data-testid="event-menu-line-overrides">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink-2">
          Recipe changes for this event
        </span>
        <span className="text-xs text-ink-3">
          {lines.length === 0 ? "None" : `${lines.length} in force`}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Cancel" : "Add change"}
        </button>
      </div>

      {lines.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {lines.map((row) => (
            <li
              key={row._id}
              className="flex flex-wrap items-center gap-2 text-xs text-ink-2"
            >
              <span>{describe(row)}</span>
              {row.reason ? (
                <span className="text-ink-3">— {String(row.reason)}</span>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disabled}
                aria-label={`Revoke ${describe(row)} on ${dishName}`}
                onClick={() => revoke(row)}
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <form
          className="mt-2 grid gap-2 rounded-sm border border-line p-3 md:grid-cols-2"
          onSubmit={submit}
        >
          <label className="field-label">
            <span>Change</span>
            <select
              className="field-input"
              name="kind"
              value={kind}
              disabled={disabled}
              onChange={(changeEvent) =>
                setKind(changeEvent.target.value as OverrideKind)
              }
            >
              {OVERRIDE_KINDS.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          {needsTarget(kind) ? (
            <label className="field-label">
              <span>Recipe line</span>
              <select
                className="field-input"
                name="target"
                required
                disabled={disabled}
                defaultValue=""
                key={`target:${targetChoices.length}`}
              >
                <option value="">Choose a recipe line…</option>
                {targetChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {needsSource(kind) ? (
            <label className="field-label">
              <span>{kind === "replace" ? "Replace with" : "Add"}</span>
              <select
                className="field-input"
                name="source"
                required
                disabled={disabled}
                defaultValue=""
                key={`source:${sourceChoices.length}`}
              >
                <option value="">Choose an ingredient or sub-recipe…</option>
                {sourceChoices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="field-label">
            <span>Portions affected</span>
            <input
              className="field-input"
              name="portionsAffected"
              type="number"
              min={0}
              step="0.01"
              required
              defaultValue="1"
              disabled={disabled}
            />
          </label>

          <label className="field-label">
            <span>Quantity (optional)</span>
            <input
              className="field-input"
              name="quantity"
              type="number"
              min={0}
              step="0.0001"
              disabled={disabled}
            />
          </label>

          <label className="field-label">
            <span>Unit (optional)</span>
            <select
              className="field-input"
              name="unit"
              defaultValue=""
              disabled={disabled}
            >
              <option value="">—</option>
              {SELECTABLE_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>

          <label className="field-label md:col-span-2">
            <span>Reason</span>
            <input
              className="field-input"
              name="reason"
              required
              placeholder="e.g. No onions for table 4"
              disabled={disabled}
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="btn btn-secondary btn-sm"
              disabled={disabled}
            >
              Save change
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
