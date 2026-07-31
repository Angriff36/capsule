import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateDishComponent,
  useDishComponentDetach,
  useListDishComponent,
  useListComponent,
} from "../../lib/manifest-convex-react";
import { componentPath } from "./kitchenRoutes";
import { TableSkeleton } from "../../ui/primitives";

// DishComponent attach/detach — the first hop of the purchasing chain.
//
// Without a row here a dish contributes nothing downstream: EventDishAdded
// fans out over DishComponent to seed EventDishComponentSeed, which drives
// ComponentIngredient -> EventIngredientContribution -> IngredientDemand ->
// PurchaseNeed -> VendorOrder. It is also what live food cost, the allergen
// matrix and margin reporting read. DishComponent.attach existed but was only
// reachable from the agent command bridge, so every dish in the app had zero
// component lines and the whole chain read empty.

type Props = {
  dishId: string;
};

export function DishComponentsPanel({ dishId }: Props) {
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const attachComponent = useCreateDishComponent();
  const detachComponent = useDishComponentDetach();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = (dishComponents ?? [])
    .filter((row) => row.deletedAt == null && row.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const attachedIds = new Set(rows.map((row) => row.componentId));
  const available = (components ?? []).filter(
    (component) =>
      component.deletedAt == null && !attachedIds.has(component._id),
  );

  async function onAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const componentId = String(data.get("componentId") ?? "");
    if (!componentId) {
      setError("Pick a component to attach.");
      return;
    }
    const component = components?.find((entry) => entry._id === componentId);
    // Default to the component's own yield so a cook never has to retype it.
    const yieldQuantity = Number(data.get("yieldQuantity") ?? 0);
    setBusy("attach");
    setError(null);
    setNotice(null);
    try {
      await attachComponent({
        dishId,
        componentId,
        yieldQuantity:
          yieldQuantity > 0
            ? yieldQuantity
            : Number(component?.yieldQuantity) || 1,
        batchMultiplier: Number(data.get("batchMultiplier") ?? 1) || 1,
        role: String(data.get("role") ?? "").trim() || undefined,
        sortOrder: rows.length,
      });
      form.reset();
      setNotice(
        "Component attached. Its ingredients now drive demand, purchasing, and food cost for every event using this dish.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not attach the component.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onDetach(id: string, version: number | undefined) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await detachComponent({
        docId: id,
        version,
        reason: "Removed from dish",
      });
      setNotice("Component detached.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not detach the component.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Components in this dish</h2>
        <span>{rows.length} attached</span>
      </div>

      {error ? <p className="text-base text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-base text-ok" role="status">
          {notice}
        </p>
      ) : null}

      {dishComponents === undefined ? (
        <TableSkeleton rows={3} />
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>
            No component attached. Until one is, this dish generates no
            ingredient demand, no purchase needs, and no food cost.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const component = components?.find(
              (entry) => entry._id === row.componentId,
            );
            return (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                data-testid="dish-component-row"
              >
                <div>
                  {component ? (
                    <Link
                      to={componentPath(component._id)}
                      className="text-lg font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {component.name}
                    </Link>
                  ) : (
                    <p className="text-lg font-medium text-ink">
                      Component unavailable
                    </p>
                  )}
                  <p className="font-mono text-xs text-ink-3">
                    yields {row.yieldQuantity}
                    {component?.yieldUnit
                      ? ` ${String(component.yieldUnit)}`
                      : ""}{" "}
                    · batch ×{row.batchMultiplier}
                    {row.role ? ` · ${row.role}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => void onDetach(row._id, row.version)}
                >
                  {busy === row._id ? "Working…" : "Detach"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onAttach}>
        <label className="block text-sm sm:col-span-2">
          <span className="meta-term">Component</span>
          <select name="componentId" className="input mt-1" defaultValue="">
            <option value="">Select a component…</option>
            {available.map((component) => (
              <option key={component._id} value={component._id}>
                {component.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="meta-term">
            Yield (0 = the component&apos;s own)
          </span>
          <input
            name="yieldQuantity"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            className="input mt-1"
          />
        </label>
        <label className="block text-sm">
          <span className="meta-term">Batch multiplier</span>
          <input
            name="batchMultiplier"
            type="number"
            min={0.01}
            step="0.01"
            defaultValue={1}
            className="input mt-1"
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="meta-term">Role (optional)</span>
          <input
            name="role"
            className="input mt-1"
            placeholder="base, sauce, garnish"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy != null || available.length === 0}
          >
            {busy === "attach" ? "Attaching…" : "Attach component"}
          </button>
        </div>
      </form>
    </section>
  );
}
